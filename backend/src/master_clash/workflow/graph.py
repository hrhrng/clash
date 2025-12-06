"""Agent graph factory inspired by deepagents' create_deep_agent.

This module provides the main API for creating agents with middleware.
"""

from typing import Sequence, Any

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable
from langchain_core.tools import BaseTool
from langchain_core.messages import SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from master_clash.workflow.backends import CanvasBackendProtocol, StateCanvasBackend
from master_clash.workflow.middleware import (
    AgentMiddleware,
    AgentState,
    CanvasMiddleware,
    TimelineMiddleware,
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
        elif isinstance(mw, TimelineMiddleware):
            all_tools.extend(mw._generate_timeline_tools())
        elif isinstance(mw, TodoListMiddleware):
            all_tools.extend(mw._generate_todo_tools())
        elif isinstance(mw, SubAgentMiddleware):
            all_tools.append(mw._create_task_tool())

    # Create agent using manual StateGraph to support custom state schema
    workflow = StateGraph(AgentState)

    # Bind tools to model
    model_with_tools = model.bind_tools(all_tools)

    def call_model(state: AgentState):
        messages = state["messages"]
        if system_prompt:
            # Add system prompt if not present
            if not messages or not isinstance(messages[0], SystemMessage):
                messages = [SystemMessage(content=system_prompt)] + messages
        
        response = model_with_tools.invoke(messages)
        return {"messages": [response]}

    def should_continue(state: AgentState):
        messages = state["messages"]
        last_message = messages[-1]
        if last_message.tool_calls:
            return "tools"
        return END

    workflow.add_node("agent", call_model)
    workflow.add_node("tools", ToolNode(all_tools))

    workflow.set_entry_point("agent")

    workflow.add_conditional_edges(
        "agent",
        should_continue,
        ["tools", END]
    )

    workflow.add_edge("tools", "agent")

    return workflow.compile(checkpointer=checkpointer)


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
        tools=[],
        system_prompt=system_prompt,
        backend=backend,
        subagents=subagents,
        checkpointer=checkpointer,
    )
