"""SubAgent middleware for task delegation.

Inspired by deepagents' SubAgentMiddleware, this allows agents to delegate
tasks to specialized sub-agents with isolated context.
"""

from dataclasses import dataclass
from typing import Annotated, Any, Callable, Sequence

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage
from langchain_core.runnables import Runnable, RunnableConfig
from langchain_core.tools import BaseTool, InjectedToolCallId
from langgraph.prebuilt import InjectedState

from master_clash.workflow.middleware import (
    AgentMiddleware,
    AgentState,
    ModelRequest,
    ModelResponse,
    ToolRuntime,
)

import logging

logger = logging.getLogger(__name__)


@dataclass
class SubAgent:
    """Definition of a sub-agent for task delegation."""

    name: str
    description: str
    system_prompt: str
    tools: Sequence[BaseTool]
    model: BaseChatModel | None = None
    middleware: Sequence[AgentMiddleware] | None = None
    workspace_aware: bool = False  # Whether this agent should work within a specific group


@dataclass
class CompiledSubAgent:
    """Compiled sub-agent with executable graph."""

    name: str
    description: str
    graph: Runnable  # CompiledGraph is a Runnable


class SubAgentMiddleware(AgentMiddleware):
    """Middleware that enables task delegation to sub-agents.

    Similar to deepagents' SubAgentMiddleware, this creates a task_tool
    that allows the main agent to delegate work to specialized agents.
    """

    def __init__(
        self,
        subagents: Sequence[SubAgent | CompiledSubAgent],
        general_purpose_agent: bool = True,
    ):
        """Initialize sub-agent middleware.

        Args:
            subagents: List of sub-agent definitions or compiled agents
            general_purpose_agent: Whether to include a general-purpose delegator
        """
        self.subagents = subagents
        self.general_purpose_agent = general_purpose_agent
        self._compiled_agents: dict[str, CompiledGraph] = {}

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Add task delegation tool to the model request."""
        # Generate task tool
        task_tool = self._create_task_tool()

        # Merge with existing tools
        request.tools = [*request.tools, task_tool]

        # Add delegation-specific system prompt
        agent_names = [
            agent.name for agent in self.subagents
        ]
        delegation_prompt = f"""
You can delegate tasks to specialized sub-agents: {', '.join(agent_names)}

Use the task_delegation tool to assign work:
- agent: Name of the sub-agent
- instruction: Clear task description
- context: Optional context data to pass

Sub-agents have isolated context and their own tools.
"""
        if request.system_prompt:
            request.system_prompt = f"{request.system_prompt}\n\n{delegation_prompt}"
        else:
            request.system_prompt = delegation_prompt

        return handler(request)

    def _create_task_tool(self) -> BaseTool:
        """Create the task delegation tool."""
        from langchain_core.tools import tool

        subagents = self.subagents

        @tool
        async def task_delegation(
            agent: str,
            instruction: str,
            workspace_group_id: str | None = None,
            context: dict[str, Any] | None = None,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Delegate a task to a specialized sub-agent.

            Args:
                agent: Name of the sub-agent to use
                instruction: Clear task description
                workspace_group_id: Optional group ID to scope the agent's work
                context: Optional context data (e.g., node IDs)
                state: Injected agent state
                config: Injected config
                tool_call_id: Injected tool call ID

            Returns:
                Result from the sub-agent
            """
            try:
                logger.info(f"Task delegation started for agent: {agent}")
                logger.debug(f"Instruction: {instruction}")
                logger.debug(f"Workspace: {workspace_group_id}")
                logger.debug(f"Context: {context}")
                
                if state is None:
                    logger.error("Runtime context is missing")
                    return "Error: Runtime context required"

                runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

                # Handle potential runtime type mismatch (e.g. if passed as dict by LLM)
                project_id = ""
                if hasattr(runtime, "state"):
                    project_id = runtime.state.get("project_id", "")
                elif isinstance(runtime, dict):
                    logger.warning("Runtime passed as dict, attempting to extract state")
                    project_id = runtime.get("state", {}).get("project_id", "")
                
                logger.debug(f"Project ID: {project_id}")

                # Find the target sub-agent
                target = None
                for sa in subagents:
                    if sa.name == agent:
                        target = sa
                        break

                if target is None:
                    available = ", ".join(sa.name for sa in subagents)
                    logger.warning(f"Unknown agent: {agent}. Available: {available}")
                    return f"Unknown agent: {agent}. Available: {available}"

                # Build sub-agent state
                msg_content = instruction
                if workspace_group_id:
                    msg_content = f"[Workspace: {workspace_group_id}]\n{instruction}"
                if context:
                    msg_content = f"{msg_content}\nContext: {context}"

                sub_state: AgentState = {
                    "messages": [HumanMessage(content=msg_content)],
                    "project_id": project_id,
                }

                # Add workspace scope to state if agent is workspace-aware
                if workspace_group_id and target.workspace_aware:
                    sub_state["workspace_group_id"] = workspace_group_id

                # Get or compile the sub-agent graph
                if isinstance(target, CompiledSubAgent):
                    graph = target.graph
                else:
                    # Compile SubAgent definition on first use
                    logger.info(f"Compiling sub-agent: {agent}")
                    graph = self._compile_subagent(target)

                # Invoke sub-agent
                logger.info(f"Invoking sub-agent: {agent}")
                result = await graph.ainvoke(sub_state)
                messages = result.get("messages", [])

                if messages:
                    last_msg = messages[-1]
                    content = getattr(last_msg, "content", "")
                    logger.info(f"Sub-agent {agent} completed successfully")
                    return f"{agent} completed: {content}"

                logger.info(f"Sub-agent {agent} completed with no output")
                return f"{agent} completed (no output)"

            except Exception as exc:
                logger.error(f"{agent} error: {exc}", exc_info=True)
                return f"{agent} error: {exc}"

        return task_delegation

    def _compile_subagent(self, subagent: SubAgent) -> Runnable:
        """Compile a SubAgent definition into an executable graph.

        Args:
            subagent: Sub-agent definition

        Returns:
            Compiled LangGraph
        """
        # Cache compiled agents
        if subagent.name in self._compiled_agents:
            return self._compiled_agents[subagent.name]

        # Import here to avoid circular dependency
        from master_clash.workflow.graph import create_agent_with_middleware

        # Compile the sub-agent with its middleware
        graph = create_agent_with_middleware(
            model=subagent.model,
            tools=subagent.tools,
            system_prompt=subagent.system_prompt,
            middleware=list(subagent.middleware) if subagent.middleware else [],
        )

        self._compiled_agents[subagent.name] = graph
        return graph


def create_specialist_agents(
    model: BaseChatModel,
    canvas_middleware: AgentMiddleware,
    timeline_middleware: AgentMiddleware,
) -> Sequence[SubAgent]:
    """Create the four specialist agents for video creation.

    Args:
        model: Language model to use
        canvas_middleware: Canvas middleware for tools
        todo_middleware: Todo middleware for planning
        timeline_middleware: Timeline middleware for editing operations

    Returns:
        List of sub-agent definitions
    """
    from master_clash.workflow.tools import (
        create_node,
        list_node_info,
        read_node,
        wait_for_task,
    )

    script_writer = SubAgent(
        name="ScriptWriter",
        description="Professional script writer for creating story outlines",
        system_prompt="""You are a professional Script Writer.
Your goal is to create a compelling story.

If you're working in a workspace (group), all your nodes will be automatically placed there.

Tasks:
1. Create a text node with the Story Outline / Script.
2. Create text nodes for Character Bios if needed.

Use canvas tools to place content on the canvas.""",
        # tools=[list_node_info, read_node, create_node],
        tools=[],
        model=model,
        middleware=[canvas_middleware],
        workspace_aware=True,  # Auto-scope nodes to workspace
    )

    concept_artist = SubAgent(
        name="ConceptArtist",
        description="Concept artist for visualizing characters and scenes",
        system_prompt="""You are a Concept Artist.
Your goal is to visualize the characters and scenes from the script.

If you're working in a workspace (group), all your nodes will be automatically placed there.

Tasks:
1. Read the script from the canvas.
2. For each character or scene:
   - Create a Prompt node with a detailed visual description.
   - Create an Image Generation node (type='image_gen') connected to the prompt.
3. AFTER creating a generation node, you MUST wait for it to complete before using its result.
   - Use wait_for_generation to check status.
   - If status is 'generating', WAIT and then RETRY.
   - Repeat until status is 'completed'.""",
        # tools=[list_node_info, read_node, create_node, wait_for_task],
        tools=[],
        model=model,
        middleware=[canvas_middleware],
        workspace_aware=True,  # Auto-scope nodes to workspace
    )

    storyboard_designer = SubAgent(
        name="StoryboardDesigner",
        description="Storyboard designer for creating shot sequences",
        system_prompt="""You are a Storyboard Designer.
Your goal is to create a sequence of shots for the video.

If you're working in a workspace (group), all your nodes will be automatically placed there.

Tasks:
1. Create Prompt nodes for each shot (Scene 1, Scene 2, etc.).
2. Create Image Generation nodes for each shot.
3. You can also create Video Generation nodes (type='video_gen') if needed.
4. ALWAYS wait for generation nodes to complete using wait_for_generation before creating dependent nodes.
   - If 'generating', retry after a short delay.""",
        # tools=[list_node_info, read_node, create_node, wait for_task],
        tools=[],
        model=model,
        middleware=[canvas_middleware],
        workspace_aware=True,  # Auto-scope nodes to workspace
    )

    editor = SubAgent(
        name="Editor",
        description="Video editor for assembling the final video",
        system_prompt="""You are a Video Editor.
Your goal is to assemble the final video.

Use timeline_editor to arrange clips from the canvas.""",
        tools=[],
        model=model,
        middleware=[timeline_middleware],
        workspace_aware=False,  # Editor works globally
    )

    return [script_writer, concept_artist, storyboard_designer, editor]
