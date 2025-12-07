"""Middleware system for agent lifecycle hooks.

Inspired by deepagents' middleware architecture, each middleware can:
- Wrap model calls (add system prompts, filter tools)
- Wrap tool calls (process results, validate inputs)
- Define state schema
- Hook into agent lifecycle
"""

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated, Any, Callable, Literal, Sequence, TypedDict, TypeVar

from pydantic import BaseModel, Field
from langchain.agents.middleware.types import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import BaseMessage, ToolMessage
from langchain.tools import BaseTool, ToolRuntime
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool, InjectedToolCallId
from langgraph.graph import add_messages
from langgraph.prebuilt import InjectedState

from master_clash.workflow.backends import (
    CanvasBackendProtocol,
    CreateNodeResult,
    NodeInfo,
    StateCanvasBackend,
    TaskStatusResult,
    TimelineOperation,
    TimelineResult,
    UpdateNodeResult,
)

# Type aliases
T = TypeVar("T")
BackendFactory = Callable[["ToolRuntime"], CanvasBackendProtocol]


class AgentState(TypedDict):
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

    state_schema = AgentState
    
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

        return handler(request.override(system_prompt=system_prompt))
    
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

        return await handler(request.override(system_prompt=system_prompt))

    def _generate_timeline_tools(self) -> list[BaseTool]:
        """Generate timeline tools."""
        return [self._timeline_editor_tool()]

    def _timeline_editor_tool(self) -> BaseTool:
        """Create timeline_editor tool."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        class TimelineEditorInput(BaseModel):
            action: str = Field(description="Timeline action, e.g. add_clip, set_duration, render")
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
                if writer:
                    writer({
                        "action": "timeline_edit",
                        "edit_action": action,
                        "params": params,
                        "project_id": project_id,
                    })

                return f"Timeline action '{action}' executed successfully"

            except Exception as e:
                return f"Error in timeline editor: {e}"

        return timeline_editor


class CanvasMiddleware(AgentMiddleware):
    """Middleware that provides canvas tools.

    Similar to FilesystemMiddleware in deepagents, but for canvas operations.
    """

    state_schema = CanvasState

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
        # Merge with existing tools

        # Add canvas-specific system prompt
        canvas_prompt = """
You have access to canvas tools for creating and managing visual content:
- list_canvas_nodes: List nodes on the canvas
- read_canvas_node: Read a specific node's data
- create_canvas_node: Create text/prompt/group nodes
- create_generation_node: Create image/video generation nodes (returns assetId)
- wait_for_generation: Wait for image/video generation to complete
- rerun_generation_node: Regenerate an existing generation node with a new asset
- search_canvas: Search nodes by content

IMPORTANT: For generation nodes (image_gen, video_gen):
1. Use create_generation_node - it returns both nodeId and assetId
2. The assetId is pre-allocated and should be used by the frontend
3. Call wait_for_generation to check status
4. To regenerate, use rerun_generation_node with the node's ID
"""
        if request.system_prompt:
            system_prompt = f"{request.system_prompt}\n\n{canvas_prompt}"
        else:
            system_prompt = canvas_prompt

        return handler(request.override(system_prompt=system_prompt))
    
    async def awrap_model_call(self, request, handler):
        """Add canvas tools to the model request."""

        # Add canvas-specific system prompt
        canvas_prompt = """
You have access to canvas tools for creating and managing visual content:
- list_canvas_nodes: List nodes on the canvas
- read_canvas_node: Read a specific node's data
- create_canvas_node: Create text/prompt/group nodes
- create_generation_node: Create image/video generation nodes (returns assetId)
- wait_for_generation: Wait for image/video generation to complete
- rerun_generation_node: Regenerate an existing generation node with a new asset
- search_canvas: Search nodes by content

IMPORTANT: For generation nodes (image_gen, video_gen):
1. Use create_generation_node - it returns both nodeId and assetId
2. The assetId is pre-allocated and should be used by the frontend
3. Call wait_for_generation to check status
4. To regenerate, use rerun_generation_node with the node's ID
"""
        if request.system_prompt:
            system_prompt = f"{request.system_prompt}\n\n{canvas_prompt}"
        else:
            system_prompt = canvas_prompt

        return await handler(request.override(system_prompt=system_prompt))

    def _generate_canvas_tools(self) -> list[BaseTool]:
        """Generate canvas tools based on backend capabilities."""
        # Tool factories (will be implemented below)
        return [
            self._list_nodes_tool(),
            self._read_node_tool(),
            self._create_node_tool(),
            self._create_generation_node_tool(),
            # self._update_node_tool(),
            # self._create_edge_tool(),
            self._wait_for_task_tool(),
            self._rerun_generation_node_tool(),
            self._search_nodes_tool(),
        ]

    def _list_nodes_tool(self) -> BaseTool:
        """Create list_canvas_nodes tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class ListCanvasNodesInput(BaseModel):
            node_type: Literal["text", "prompt", "group", "image", "video"] | None = Field(default=None, description="Optional filter by node type")
            parent_id: str | None = Field(default=None, description="Optional filter by parent group")

        @tool(args_schema=ListCanvasNodesInput)
        def list_canvas_nodes(
            runtime: ToolRuntime,
            node_type: str | None = None,
            parent_id: str | None = None,
        ) -> str:
            """List nodes on the canvas."""

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                nodes = resolved_backend.list_nodes(
                    project_id=project_id,
                    node_type=node_type,
                    parent_id=parent_id,
                )

                if not nodes:
                    return "No nodes found."

                lines = ["Canvas nodes:"]
                for node in nodes:
                    data = node.data or {}
                    name = data.get("label") or data.get("name") or ""
                    description = data.get("description") or ""

                    line = f"- {node.id} ({node.type}): {name}" if name else f"- {node.id} ({node.type})"
                    if description:
                        line = f"{line} - {description}"

                    lines.append(line)
                return "\n".join(lines)

            except Exception as e:
                return f"Error listing nodes: {e}"

        return list_canvas_nodes

    def _read_node_tool(self) -> BaseTool:
        """Create read_canvas_node tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class ReadCanvasNodeInput(BaseModel):
            node_id: str = Field(description="Target node ID")

        @tool(args_schema=ReadCanvasNodeInput)
        def read_canvas_node(
            node_id: str,
            runtime: ToolRuntime,
        ) -> list[str | dict]:
            """Read a specific node's detailed data."""
            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                node = resolved_backend.read_node(
                    project_id=project_id,
                    node_id=node_id,
                )

                if node is None:
                    return f"Node {node_id} not found."

                data = node.data or {}
                name = data.get("label") or data.get("name") or node.id
                description = data.get("description") or data.get("content") or ""
                text_part = {"type": "text", "text": f"{name}: {description} type: {node.type}" if description else name}

                # If the node is an image/video, return straightforward media + text parts
                if node.type in {"image", "video"}:
                    from master_clash.utils import get_asset_base64

                    def pick_source() -> str | None:
                        for key in ("base64", "src", "url", "thumbnail", "poster", "cover"):
                            value = data.get(key)
                            if isinstance(value, str) and value:
                                return value
                        return None

                    def to_base64_and_mime(source: str, default_mime: str) -> tuple[str, str]:
                        if source.startswith("data:"):
                            header, payload = source.split(",", 1)
                            mime = header.split(":", 1)[1].split(";")[0] or default_mime
                            return payload, mime
                        if "base64," in source:
                            payload = source.split("base64,", 1)[1]
                            return payload, default_mime
                        # Fallback: treat as URL and fetch
                        return get_asset_base64(source)

                    source = pick_source()
                    if source:
                        try:
                            if node.type == "video":
                                base64_data, mime_type = to_base64_and_mime(source, "video/mp4")
                                media_part = {
                                    "type": "media",
                                    "data": base64_data,
                                    "mime_type": mime_type,
                                }
                            else:
                                base64_data, mime_type = to_base64_and_mime(source, "image/jpeg")
                                media_part = {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:{mime_type};base64,{base64_data}"},
                                }
                            return [media_part, text_part]
                        except Exception:
                            # If conversion fails, fall back to returning raw source + text
                            raw_part = {"type": "image_url", "image_url": source} if node.type == "image" else {"type": "media", "data": source}
                            return [raw_part, text_part]

                    return text_part.get("text")

                return text_part.get("text")

            except Exception as e:
                return f"Error reading node: {e}"

        return read_canvas_node

    def _create_node_tool(self) -> BaseTool:
        """Create create_canvas_node tool."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        backend = self.backend

        class CanvasNodeData(BaseModel):
            label: str = Field(description="Display label for the node")
            content: str | None = Field(
                default=None,
                description="Markdown/text content (text/prompt nodes)",
            )
            description: str | None = Field(
                default=None,
                description="Optional description (useful for group nodes)",
            )

            class Config:
                extra = "allow"  # Preserve any additional metadata

        class CreateCanvasNodeInput(BaseModel):
            node_type: Literal["text", "prompt", "group"] = Field(
                description="Node type to create (non-generative)"
            )
            payload: CanvasNodeData = Field(description="Structured payload for text/prompt/group nodes")
            position: dict[str, float] | None = Field(
                default=None, description="Optional canvas coordinates {x, y}"
            )
            parent_id: str | None = Field(
                default=None,
                description="Optional parent group; defaults to current workspace when omitted",
            )

        @tool(args_schema=CreateCanvasNodeInput)
        def create_canvas_node(
            node_type: str,
            payload: CanvasNodeData,
            runtime: ToolRuntime,
            position: dict[str, float] | None = None,
            parent_id: str | None = None,
        ) -> str:
            """Create a new node on the canvas."""

            project_id = runtime.state.get("project_id", "")

            # Auto-set parent_id from workspace if not explicitly provided
            if parent_id is None:
                workspace_group_id = runtime.state.get("workspace_group_id")
                if workspace_group_id:
                    parent_id = workspace_group_id

            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.create_node(
                    project_id=project_id,
                    node_type=node_type,
                    data=payload.model_dump(exclude_none=True),
                    position=position,
                    parent_id=parent_id,
                )

                if result.error:
                    return f"Error: {result.error}"

                # Emit SSE proposal if available
                if result.proposal:
                    writer = get_stream_writer()
                    if writer:
                        writer({
                            "action": "create_node_proposal",
                            "proposal": result.proposal,
                        })

                return f"Created node {result.node_id}"

            except Exception as e:
                return f"Error creating node: {e}"

        return create_canvas_node

    def _create_generation_node_tool(self) -> BaseTool:
        """Create create_generation_node tool (image/video)."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        backend = self.backend

        class GenerationNodeData(BaseModel):
            label: str = Field(description="Display label for the node")
            # prompt: str = Field(description="Generation prompt for image/video models")
            modelName: str | None = Field(default=None, description="Optional model name override")
            actionType: Literal["image-gen", "video-gen"] | None = Field(
                default=None,
                description="Optional override; inferred from node_type when omitted",
            )
            upstreamNodeIds: list[str] | None = Field(
                default=None, description="Optional upstream node linkages, could link image node to reference or edit and prompt node as natural language instruction"
            )

            class Config:
                extra = "allow"  # Preserve any additional metadata

        class CreateGenerationNodeInput(BaseModel):
            node_type: Literal["image_gen", "video_gen"] = Field(
                description="Generation node type to create"
            )
            payload: GenerationNodeData = Field(description="Structured payload for generation node")
            position: dict[str, float] | None = Field(
                default=None, description="Optional canvas coordinates {x, y}"
            )
            parent_id: str | None = Field(
                default=None,
                description="Optional parent group; defaults to current workspace when omitted",
            )

        @tool(args_schema=CreateGenerationNodeInput)
        def create_generation_node_and_run(
            node_type: str,
            payload: GenerationNodeData,
            runtime: ToolRuntime,
            position: dict[str, float] | None = None,
            parent_id: str | None = None,
        ) -> str:
            """Create a new generation node (image/video) on the canvas.

            Returns the nodeId and assetId for the created generation node.
            The assetId should be used when creating the asset in the database.
            """

            project_id = runtime.state.get("project_id", "")

            # Auto-set parent_id from workspace if not explicitly provided
            if parent_id is None:
                workspace_group_id = runtime.state.get("workspace_group_id")
                if workspace_group_id:
                    parent_id = workspace_group_id

            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.create_node(
                    project_id=project_id,
                    node_type=node_type,
                    data=payload.model_dump(exclude_none=True),
                    position=position,
                    parent_id=parent_id,
                )

                if result.error:
                    return f"Error: {result.error}"

                # Emit SSE proposal if available
                if result.proposal:
                    writer = get_stream_writer()
                    if writer:
                        writer({
                            "action": "create_node_proposal",
                            "proposal": result.proposal,
                        })

                # Return both nodeId and assetId for generation nodes
                if result.asset_id:
                    return f"Created generation node - nodeId: {result.node_id}, assetNodeId: {result.asset_id}"
                else:
                    return f"Created generation node {result.node_id}"

            except Exception as e:
                return f"Error creating generation node: {e}"

        return create_generation_node_and_run

    def _update_node_tool(self) -> BaseTool:
        """Create update_canvas_node tool."""
        from langchain_core.tools import tool

        backend = self.backend

        class UpdateCanvasNodeInput(BaseModel):
            node_id: str = Field(description="Target node ID")
            data: dict[str, Any] | None = Field(default=None, description="Partial data update")
            position: dict[str, float] | None = Field(
                default=None, description="Optional position update {x, y}"
            )

        @tool(args_schema=UpdateCanvasNodeInput)
        def update_canvas_node(
            node_id: str,
            runtime: ToolRuntime,
            data: dict[str, Any] | None = None,
            position: dict[str, float] | None = None,
        ) -> str:
            """Update an existing node."""
            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.update_node(
                    project_id=project_id,
                    node_id=node_id,
                    data=data,
                    position=position,
                )

                if result.error:
                    return f"Error: {result.error}"

                return f"Updated node {node_id}"

            except Exception as e:
                return f"Error updating node: {e}"

        return update_canvas_node

    def _create_edge_tool(self) -> BaseTool:
        """Create create_canvas_edge tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class CreateCanvasEdgeInput(BaseModel):
            source: str = Field(description="Source node ID")
            target: str = Field(description="Target node ID")
            source_handle: str | None = Field(default=None, description="Optional source handle")
            target_handle: str | None = Field(default=None, description="Optional target handle")

        @tool(args_schema=CreateCanvasEdgeInput)
        def create_canvas_edge(
            source: str,
            target: str,
            runtime: ToolRuntime,
            source_handle: str | None = None,
            target_handle: str | None = None,
        ) -> str:
            """Create an edge connecting two nodes."""

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.create_edge(
                    project_id=project_id,
                    source=source,
                    target=target,
                    source_handle=source_handle,
                    target_handle=target_handle,
                )

                if result.error:
                    return f"Error: {result.error}"

                return f"Created edge from {source} to {target}"

            except Exception as e:
                return f"Error creating edge: {e}"

        return create_canvas_edge

    def _wait_for_task_tool(self) -> BaseTool:
        """Create wait_for_generation tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class WaitForGenerationInput(BaseModel):
            node_id: str = Field(description="Node with generation task")
            timeout_seconds: float = Field(description="Max wait time in seconds")

        @tool(args_schema=WaitForGenerationInput)
        def wait_for_generation(
            node_id: str,
            timeout_seconds: float,
            runtime: ToolRuntime,
        ) -> str:
            """Wait for a generation task (image/video) to complete."""

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.wait_for_task(
                    project_id=project_id,
                    node_id=node_id,
                    timeout_seconds=timeout_seconds,
                )

                if result.error:
                    return f"Error: {result.error}"

                if result.status == "completed":
                    return f"Task completed. Output: {result.output}"
                elif result.status == "generating":
                    return f"Task still generating. Please retry wait_for_generation after a moment."
                elif result.status == "failed":
                    return f"Task failed: {result.error}"
                else:
                    return f"Node not found: {node_id}"

            except Exception as e:
                return f"Error waiting for task: {e}"

        return wait_for_generation

    def _rerun_generation_node_tool(self) -> BaseTool:
        """Create rerun_generation_node tool."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        backend = self.backend

        class RerunGenerationNodeInput(BaseModel):
            node_id: str = Field(description="Generation node ID to rerun")

        @tool(args_schema=RerunGenerationNodeInput)
        def rerun_generation_node(
            node_id: str,
            runtime: ToolRuntime,
        ) -> str:
            """Rerun a generation node (image/video) to regenerate the asset.

            This is useful when you want to regenerate an image/video with the same parameters.
            """

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                # Read the existing node to get its configuration
                node = resolved_backend.read_node(
                    project_id=project_id,
                    node_id=node_id,
                )

                if node is None:
                    return f"Error: Node {node_id} not found"

                # Verify it's a generation node
                # Note: Frontend uses 'action-badge' type with actionType in data
                if node.type != "action-badge":
                    return f"Error: Node {node_id} is not a generation node (type: {node.type})"

                # Check if it has actionType (image-gen or video-gen)
                action_type = node.data.get("actionType") if node.data else None
                if action_type not in ("image-gen", "video-gen"):
                    return f"Error: Node {node_id} is not a generation node (actionType: {action_type})"

                # Generate new asset ID if not provided
                from master_clash.semantic_id import create_d1_checker, generate_unique_id_for_project
                checker = create_d1_checker()
                asset_id = generate_unique_id_for_project(project_id, checker)

                # Emit SSE event to trigger regeneration on frontend
                writer = get_stream_writer()
                if writer:
                    writer({
                        "action": "rerun_generation_node",
                        "nodeId": node_id,
                        "assetId": asset_id,
                        "nodeData": node.data,
                    })

                return f"Triggered regeneration for node {node_id} with new assetId: {asset_id}"

            except Exception as e:
                return f"Error rerunning generation node: {e}"

        return rerun_generation_node

    def _search_nodes_tool(self) -> BaseTool:
        """Create search_canvas tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class SearchCanvasInput(BaseModel):
            query: str = Field(description="Search query")
            node_types: list[str] | None = Field(default=None, description="Optional filter by node types")

        @tool(args_schema=SearchCanvasInput)
        def search_canvas(
            query: str,
            runtime: ToolRuntime,
            node_types: list[str] | None = None,
        ) -> str:
            """Search nodes by content or metadata."""

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                nodes = resolved_backend.search_nodes(
                    project_id=project_id,
                    query=query,
                    node_types=node_types,
                )

                if not nodes:
                    return f"No nodes found matching '{query}'."

                lines = [f"Search results for '{query}':"]
                for node in nodes:
                    lines.append(f"- {node.id} ({node.type}): {node.data}")
                return "\n".join(lines)

            except Exception as e:
                return f"Error searching: {e}"

        return search_canvas
