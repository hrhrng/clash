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
)
from master_clash.workflow.subagents import SubAgent, SubAgentMiddleware
from langchain.agents import create_agent


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

    return create_agent(
        model=model,
        tools=tools,
        middleware=middleware,
        system_prompt=system_prompt,
        checkpointer=checkpointer
    )


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
   - Use `create_canvas_node` to create groups
   - Use `list_canvas_nodes` to see existing groups

2. **Delegate Tasks**: Assign work to specialists
   - Use `task_delegation` to assign work
   - Pass `workspace_group_id` to scope their work to a specific group, create a group if neccesary
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
