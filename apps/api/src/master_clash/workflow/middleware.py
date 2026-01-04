"""Middleware system for agent lifecycle hooks.

Inspired by deepagents' middleware architecture, each middleware can:
- Wrap model calls (add system prompts, filter tools)
- Wrap tool calls (process results, validate inputs)
- Define state schema
- Hook into agent lifecycle
"""

import logging
from collections.abc import Callable
from typing import Annotated, Any, TypeVar

from langchain.agents.middleware.types import (
    AgentMiddleware,
    ModelRequest,
    ModelResponse,
)
from langchain.messages import SystemMessage
from langchain.tools import BaseTool, ToolRuntime
from langchain_core.messages import BaseMessage
from langgraph.graph import add_messages
from pydantic import BaseModel, Field

from master_clash.workflow.backends import (
    CanvasBackendProtocol,
    NodeInfo,
    StateCanvasBackend,
)
from master_clash.workflow.tools import (
    create_list_nodes_tool,
    create_read_node_tool,
    create_create_node_tool,
    create_generation_node_tool,
    create_run_generation_tool,
    create_wait_generation_tool,
    create_search_nodes_tool,
)

logger = logging.getLogger(__name__)

# Type aliases
T = TypeVar("T")
BackendFactory = Callable[["ToolRuntime"], CanvasBackendProtocol]


class AgentState:
    """Base agent state schema."""

    messages: Annotated[list[BaseMessage], add_messages]
    project_id: str
    workspace_group_id: str | None  # Optional workspace scope for sub-agents


class CanvasState(AgentState):
    """Extended state with canvas data."""

    canvas_nodes: dict[str, NodeInfo]  # node_id -> NodeInfo
    canvas_edges: dict[str, dict[str, Any]]  # edge_id -> edge data


def _canvas_reducer(
    left: dict[str, NodeInfo] | None,
    right: dict[str, NodeInfo],
) -> dict[str, NodeInfo]:
    """Merge canvas nodes, support deletion by setting value=None."""
    if left is None:
        return {k: v for k, v in right.items() if v is not None}
    result = {**left}
    for key, value in right.items():
        if value is None:
            result.pop(key, None)
        else:
            result[key] = value
    return result


class TimelineMiddleware(AgentMiddleware):
    """Middleware that provides timeline editing tools."""

    def __init__(self):
        self.tools = self._generate_timeline_tools()

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Add timeline tools to the model request."""

        timeline_prompt = """
You can control the video timeline via the timeline_editor tool.
- timeline_editor: Provide an action (e.g., add_clip, set_duration, render) and params.
"""
        if request.system_prompt:
            system_prompt = f"{request.system_prompt}\n\n{timeline_prompt}"
        else:
            system_prompt = timeline_prompt

        return handler(request.override(system_message=SystemMessage(system_prompt)))

    async def awrap_model_call(self, request, handler):
        """Add timeline tools to the model request."""

        timeline_prompt = """
You can control the video timeline via the timeline_editor tool.
- timeline_editor: Provide an action (e.g., add_clip, set_duration, render) and params.
"""
        if request.system_prompt:
            system_prompt = f"{request.system_prompt}\n\n{timeline_prompt}"
        else:
            system_prompt = timeline_prompt

        return await handler(
            request.override(system_message=SystemMessage(system_prompt))
        )

    def _generate_timeline_tools(self) -> list[BaseTool]:
        """Generate timeline tools."""
        return [self._timeline_editor_tool()]

    def _timeline_editor_tool(self) -> BaseTool:
        """Create timeline_editor tool."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        class TimelineEditorInput(BaseModel):
            action: str = Field(
                description="Timeline action, e.g. add_clip, set_duration, render"
            )
            params: dict[str, Any] = Field(description="Action parameters")

        @tool(args_schema=TimelineEditorInput)
        def timeline_editor(
            action: str,
            params: dict[str, Any],
            runtime: ToolRuntime,
        ) -> str:
            """Automated video editor tool."""

            project_id = runtime.state.get("project_id", "")

            try:
                # Emit SSE event for timeline editing
                writer = get_stream_writer()
                writer(
                    {
                        "action": "timeline_edit",
                        "edit_action": action,
                        "params": params,
                        "project_id": project_id,
                    }
                )

                return f"Timeline action '{action}' executed successfully"

            except Exception as e:
                return f"Error in timeline editor: {e}"

        return timeline_editor


class CanvasMiddleware(AgentMiddleware):
    """Middleware that provides canvas tools.

    Similar to FilesystemMiddleware in deepagents, but for canvas operations.
    Tool implementations are extracted to master_clash.workflow.tools package.
    """

    def __init__(
        self,
        backend: CanvasBackendProtocol | BackendFactory | None = None,
    ):
        """Initialize canvas middleware.

        Args:
            backend: Canvas backend or factory function
        """
        self.backend = backend or StateCanvasBackend()
        self.tools = self._generate_canvas_tools()

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Add canvas tools to the model request."""
        canvas_prompt = self._get_canvas_prompt()
        if request.system_prompt:
            system_prompt = f"{request.system_prompt}\n\n{canvas_prompt}"
        else:
            system_prompt = canvas_prompt

        return handler(request.override(system_message=SystemMessage(system_prompt)))

    async def awrap_model_call(self, request, handler):
        """Add canvas tools to the model request."""
        canvas_prompt = self._get_canvas_prompt()
        if request.system_prompt:
            system_prompt = f"{request.system_prompt}\n\n{canvas_prompt}"
        else:
            system_prompt = canvas_prompt

        return await handler(
            request.override(system_message=SystemMessage(system_prompt))
        )

    def _get_canvas_prompt(self) -> str:
        """Get the canvas-specific system prompt."""
        return """
You have access to canvas tools for creating and managing visual content:
- list_canvas_nodes: List nodes on the canvas
- read_canvas_node: Read a specific node's data
- create_canvas_node: Create text/group nodes (for organization)
- create_generation_node: Create PromptActionNodes with embedded prompts for image/video generation
- run_generation_node: Run a generation node to produce the asset (call after create)
- wait_for_generation: Wait for image/video generation to complete (ONLY pass image/video asset node IDs, NOT action-badge IDs)
- search_canvas: Search nodes by content

**CRITICAL: Always Organize in Groups**
1. FIRST create a Group to contain your work (e.g., "Scene 1", "Character Designs")
2. THEN create all content nodes with parentId pointing to that group
3. NEVER leave nodes floating outside of a group!

IMPORTANT: PromptActionNode Architecture:
- Prompt and action are now MERGED into a single node type
- When creating image_gen or video_gen nodes, include BOTH the prompt content AND action type in one node
- The 'prompt' field contains the generation prompt for the AI model
- The 'content' field contains the markdown prompt content visible to users
- You do NOT need to create separate prompt/text nodes - everything is in the PromptActionNode

Workflow:
1. Create a Group first (using create_canvas_node with type='group')
2. Use create_generation_node with:
   - 'prompt': detailed generation prompt for the AI model
   - 'content': markdown description/notes for display
   - 'parent_id': The group ID from step 1 (REQUIRED!)
   - For video_gen: MUST include upstreamNodeIds with at least one completed image node ID
   - For image_gen: upstreamNodeIds are optional
3. Then use run_generation_node to trigger the generation
4. Call wait_for_generation to check status (pass the returned asset node ID, NOT the action-badge ID)
"""

    def _generate_canvas_tools(self) -> list[BaseTool]:
        """Generate canvas tools based on backend capabilities."""
        return [
            create_list_nodes_tool(self.backend),
            create_read_node_tool(self.backend),
            create_create_node_tool(self.backend),
            create_generation_node_tool(self.backend),
            create_run_generation_tool(self.backend),
            create_wait_generation_tool(self.backend),
            create_search_nodes_tool(self.backend),
        ]
