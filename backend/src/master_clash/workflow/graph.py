"""Agent graph factory inspired by deepagents' create_deep_agent.

This module provides the main API for creating agents with middleware.
"""

from typing import Sequence, Any

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool
from langgraph.graph import END, StateGraph
from langchain.agents import create_agent

from master_clash.workflow.backends import CanvasBackendProtocol, StateCanvasBackend
from master_clash.workflow.middleware import (
    AgentMiddleware,
    AgentState,
    CanvasMiddleware,
    TodoListMiddleware,
)
from master_clash.workflow.subagents import SubAgent, SubAgentMiddleware


def create_agent_with_middleware(
    model: BaseChatModel,
    tools: Sequence[BaseTool],
    system_prompt: str | None = None,
    middleware: Sequence[AgentMiddleware] | None = None,
    backend: CanvasBackendProtocol | None = None,
    subagents: Sequence[SubAgent] | None = None,
    checkpointer: Any | None = None,
) -> Runnable:
    """Create an agent with middleware stack.

    This is the main factory function, inspired by deepagents' create_deep_agent.

    Args:
        model: Language model to use
        tools: Base tools (middleware will add more)
        system_prompt: Optional system prompt
        middleware: Custom middleware stack (if None, uses defaults)
        backend: Canvas backend (defaults to StateCanvasBackend)
        subagents: Sub-agents for delegation
        checkpointer: Optional persistence checkpointer

    Returns:
        Compiled LangGraph agent
    """
    # Default middleware stack
    if middleware is None:
        middleware = _create_default_middleware(backend, subagents)

    # Collect all tools from middleware
    all_tools = list(tools)

    # Apply middleware to collect tools (simplified version)
    # In a full implementation, middleware would wrap model/tool calls
    for mw in middleware:
        if isinstance(mw, CanvasMiddleware):
            all_tools.extend(mw._generate_canvas_tools())
        elif isinstance(mw, TodoListMiddleware):
            all_tools.extend(mw._generate_todo_tools())
        elif isinstance(mw, SubAgentMiddleware):
            all_tools.append(mw._create_task_tool())

    # Create agent using LangGraph's create_react_agent
    # Note: This is a simplified version. A full implementation would
    # integrate middleware wrapping into the execution pipeline.
    agent = create_agent(
        model=model,
        tools=all_tools,
        state_schema=AgentState,
        system_prompt=system_prompt,
        checkpointer=checkpointer,
    )
    return agent


def _create_default_middleware(
    backend: CanvasBackendProtocol | None,
    subagents: Sequence[SubAgent] | None,
) -> Sequence[AgentMiddleware]:
    """Create default middleware stack.

    Args:
        backend: Canvas backend
        subagents: Sub-agents for delegation

    Returns:
        Default middleware stack
    """
    backend = backend or StateCanvasBackend()

    middleware: list[AgentMiddleware] = [
        TodoListMiddleware(),
        CanvasMiddleware(backend=backend),
    ]

    if subagents:
        middleware.append(SubAgentMiddleware(subagents=subagents))

    return middleware


def create_supervisor_agent(
    model: BaseChatModel,
    subagents: Sequence[SubAgent],
    system_prompt: str | None = None,
    backend: CanvasBackendProtocol | None = None,
    checkpointer: Any | None = None,
) -> Runnable:
    """Create a supervisor agent that delegates to specialists.

    Args:
        model: Language model to use
        subagents: Specialist sub-agents
        system_prompt: Optional system prompt
        backend: Canvas backend
        checkpointer: Optional persistence checkpointer

    Returns:
        Compiled supervisor agent
    """
    from langchain_core.tools import tool
    from langgraph.config import get_stream_writer

    # Create supervisor-specific tools
    backend = backend or StateCanvasBackend()

    @tool
    def create_workspace_group(
        name: str,
        description: str | None = None,
    ) -> str:
        """Create a workspace group for organizing related nodes.

        This is useful when delegating work to sub-agents - you can create
        a group first, then pass the group ID to the sub-agent so all their
        work is organized together.

        Args:
            name: Group name (e.g., "Character Design Workspace")
            description: Optional description

        Returns:
            Group ID that can be passed to sub-agents
        """
        from master_clash.context import get_project_context
        from master_clash.semantic_id import create_d1_checker, generate_unique_id_for_project

        # Get project_id from context (we'll need to pass this via runtime)
        # For now, return a placeholder
        import uuid
        checker = create_d1_checker()
        # TODO: Get actual project_id from runtime
        project_id = "temp"  # This should come from runtime
        group_id = generate_unique_id_for_project(project_id, checker)

        # Emit SSE proposal
        writer = get_stream_writer()
        if writer:
            proposal_id = f"proposal-{uuid.uuid4().hex[:8]}"
            writer({
                "action": "create_node_proposal",
                "proposal": {
                    "id": proposal_id,
                    "type": "group",
                    "nodeType": "group",
                    "nodeData": {
                        "id": group_id,
                        "label": name,
                        "description": description or "",
                    },
                    "message": f"Created workspace group: {name}",
                },
            })

        return f"Created workspace group '{name}' with ID: {group_id}. Pass this ID to sub-agents via workspace_group_id parameter."

    @tool
    def list_workspace_groups() -> str:
        """List all existing workspace groups (groups on the canvas).

        Returns:
            List of groups with their IDs
        """
        from master_clash.context import get_project_context

        # TODO: Get project_id from runtime
        project_id = "temp"
        context = get_project_context(project_id, force_refresh=True)

        if not context:
            return "No context found."

        groups = [node for node in context.nodes if node.type == "group"]

        if not groups:
            return "No workspace groups found."

        lines = ["Workspace groups:"]
        for group in groups:
            label = group.data.get("label", "Untitled")
            desc = group.data.get("description", "")
            lines.append(f"- {group.id}: {label}" + (f" ({desc})" if desc else ""))

        return "\n".join(lines)

    # Supervisor tools: workspace management + delegation (added by middleware)
    supervisor_tools = [create_workspace_group, list_workspace_groups]

    if system_prompt is None:
        agent_names = [sa.name for sa in subagents]
        system_prompt = f"""You are the Supervisor. You coordinate work between specialized agents.

Available agents: {', '.join(agent_names)}

## Your Workflow:

1. **Organize Work**: Create workspace groups for organizing related tasks
   - Use `create_workspace_group` to create groups
   - Use `list_workspace_groups` to see existing groups

2. **Delegate Tasks**: Assign work to specialists
   - Use `task_delegation` to assign work
   - Pass `workspace_group_id` to scope their work to a specific group
   - Provide clear instructions and context

3. **Simple Tasks**: You can also handle simple tasks directly using canvas tools

## Example:

User: "Create a character design for a space explorer"

Step 1: Create workspace
create_workspace_group(name="Space Explorer Character", description="Character design workspace")
→ Returns: group-abc-123

Step 2: Delegate to specialist
task_delegation(
  agent="ConceptArtist",
  instruction="Design a space explorer character with futuristic suit",
  workspace_group_id="group-abc-123"
)

All the agent's work (prompts, images) will be organized inside that group!
"""

    # Create supervisor with SubAgentMiddleware + CanvasMiddleware
    return create_agent_with_middleware(
        model=model,
        tools=supervisor_tools,
        system_prompt=system_prompt,
        backend=backend,
        subagents=subagents,
        checkpointer=checkpointer,
    )
