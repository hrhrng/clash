"""Middleware system for agent lifecycle hooks.

Inspired by deepagents' middleware architecture, each middleware can:
- Wrap model calls (add system prompts, filter tools)
- Wrap tool calls (process results, validate inputs)
- Define state schema
- Hook into agent lifecycle
"""

import logging
from collections.abc import Callable
from typing import Annotated, Any, Literal, TypedDict, TypeVar

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

logger = logging.getLogger(__name__)

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
        # Merge with existing tools

        # Add canvas-specific system prompt
        canvas_prompt = """
You have access to canvas tools for creating and managing visual content:
- list_canvas_nodes: List nodes on the canvas
- read_canvas_node: Read a specific node's data
- create_canvas_node: Create text/group nodes (for organization)
- create_generation_node: Create PromptActionNodes with embedded prompts for image/video generation
- run_generation_node: Run a generation node to produce the asset (call after create)
- wait_for_generation: Wait for image/video generation to complete
- search_canvas: Search nodes by content

IMPORTANT: PromptActionNode Architecture:
- Prompt and action are now MERGED into a single node type
- When creating image_gen or video_gen nodes, include BOTH the prompt content AND action type in one node
- The 'prompt' field contains the generation prompt for the AI model
- The 'content' field contains the markdown prompt content visible to users
- You do NOT need to create separate prompt/text nodes - everything is in the PromptActionNode

Workflow:
1. Use create_generation_node with both 'prompt' (for AI) and 'content' (for display)
2. Then use run_generation_node to trigger the generation
3. Call wait_for_generation to check status
"""
        if request.system_prompt:
            system_prompt = f"{request.system_prompt}\n\n{canvas_prompt}"
        else:
            system_prompt = canvas_prompt

        return handler(request.override(system_message=SystemMessage(system_prompt)))

    async def awrap_model_call(self, request, handler):
        """Add canvas tools to the model request."""

        # Add canvas-specific system prompt
        canvas_prompt = """
You have access to canvas tools for creating and managing visual content:
- list_canvas_nodes: List nodes on the canvas
- read_canvas_node: Read a specific node's data
- create_canvas_node: Create text/group nodes (for organization)
- create_generation_node: Create PromptActionNodes with embedded prompts for image/video generation
- run_generation_node: Run a generation node to produce the asset (call after create)
- wait_for_generation: Wait for image/video generation to complete
- search_canvas: Search nodes by content

IMPORTANT: PromptActionNode Architecture:
- Prompt and action are now MERGED into a single node type
- When creating image_gen or video_gen nodes, include BOTH the prompt content AND action type in one node
- The 'prompt' field contains the generation prompt for the AI model
- The 'content' field contains the markdown prompt content visible to users
- You do NOT need to create separate prompt/text nodes - everything is in the PromptActionNode

Workflow:
1. Use create_generation_node with:
   - 'prompt': detailed generation prompt for the AI model
   - 'content': markdown description/notes for display
   - For video_gen: MUST include upstreamNodeIds with at least one completed image node ID
   - For image_gen: upstreamNodeIds are optional
2. Then use run_generation_node to trigger the generation
3. Call wait_for_generation to check status
"""
        if request.system_prompt:
            system_prompt = f"{request.system_prompt}\n\n{canvas_prompt}"
        else:
            system_prompt = canvas_prompt
        # if isinstance(last_message:=request.messages[-1], ToolMessage):
        #     if last_message.name == "read_canvas_node":
        #         if isinstance(last_message.content, dict):
        #             content = last_message.content['text']
        #         else:
        #             content = last_message.content
        #         if content.startswith("video"): # 加上视频Message
        #             messages = request.messages.append(UserMessage(""))

        return await handler(
            request.override(system_message=SystemMessage(system_prompt))
        )

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
            self._run_generation_node_tool(),
            self._search_nodes_tool(),
        ]

    def _list_nodes_tool(self) -> BaseTool:
        """Create list_canvas_nodes tool."""
        from langchain_core.tools import tool

        backend = self.backend

        class ListCanvasNodesInput(BaseModel):
            node_type: Literal["text", "prompt", "group", "image", "video"] | None = (
                Field(default=None, description="Optional filter by node type")
            )
            parent_id: str | None = Field(
                default=None, description="Optional filter by parent group"
            )

        @tool(args_schema=ListCanvasNodesInput)
        def list_canvas_nodes(
            runtime: ToolRuntime,
            node_type: str | None = None,
            parent_id: str | None = None,
        ) -> str:
            """List nodes on the canvas."""

            project_id = runtime.state.get("project_id", "")

            # Try to get nodes from Loro first (real-time state)
            loro_client = runtime.config.get("configurable", {}).get("loro_client")
            nodes = []

            if loro_client and loro_client.connected:
                try:
                    loro_nodes_dict = loro_client.get_all_nodes()
                    nodes = [
                        NodeInfo(
                            id=node_id,
                            type=node_data.get("type", "unknown"),
                            position=node_data.get("position", {"x": 0, "y": 0}),
                            data=node_data.get("data", {}),
                            parent_id=node_data.get("parentId"),
                        )
                        for node_id, node_data in loro_nodes_dict.items()
                    ]
                    logger.info(f"[LoroSync] Read {len(nodes)} nodes from Loro")
                except Exception as e:
                    logger.error(f"[LoroSync] Failed to read from Loro: {e}")
                    # Fall back to backend

            # Fall back to backend if Loro not available or failed
            if not nodes:
                resolved_backend = backend(runtime) if callable(backend) else backend
                nodes = resolved_backend.list_nodes(
                    project_id=project_id, node_type=None, parent_id=None
                )
                logger.info(f"list canvas nodes from backend: {nodes}")

            if not nodes:
                return "No nodes found."

            # Build parent -> children map
            from collections import defaultdict

            children: dict[str | None, list[NodeInfo]] = defaultdict(list)
            for node in nodes:
                children[node.parent_id].append(node)

            def display_label(node: NodeInfo) -> str:
                data = node.data or {}
                name = data.get("label") or data.get("name") or ""
                description = data.get("description") or ""
                base = f"{node.id} ({node.type})"
                if name:
                    base = f"{base}: {name}"
                if description:
                    base = f"{base} - {description}"
                if node.type == "group":
                    base = f"{base}/"
                return base

            def matches_filter(node: NodeInfo) -> bool:
                return node_type is None or node.type == node_type

            def render_tree(
                current_parent: str | None, indent: str = ""
            ) -> tuple[list[str], bool]:
                lines: list[str] = []
                has_match = False

                # Groups first, then others, for a folder-like view
                sorted_children = sorted(
                    children.get(current_parent, []),
                    key=lambda n: (
                        0 if n.type == "group" else 1,
                        (n.data or {}).get("label", ""),
                        n.id,
                    ),
                )

                for child in sorted_children:
                    child_matches = matches_filter(child)

                    if child.type == "group":
                        rendered_child_lines, subtree_has_match = render_tree(
                            child.id, indent + "  "
                        )
                        if child_matches or subtree_has_match:
                            lines.append(f"{indent}- {display_label(child)}")
                            lines.extend(rendered_child_lines)
                            has_match = True
                            continue
                    else:
                        if child_matches:
                            lines.append(f"{indent}- {display_label(child)}")
                            has_match = True
                            continue

                    # If the child didn't match and isn't a group with matches, skip it
                return lines, has_match

            # Start from requested parent or root (None)
            root_parent = parent_id or None
            tree_lines, has_any = render_tree(root_parent, "")

            if not has_any:
                return "No nodes found."

            header = "Canvas nodes (tree):"
            return "\n".join([header, *tree_lines])

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
        ) -> list[str | dict] | str:
            """Read a specific node's detailed data.
            For image, specially, you can see it.
            """
            project_id = runtime.state.get("project_id", "")
            
            # Try to get node from Loro first (real-time state)
            loro_client = runtime.config.get("configurable", {}).get("loro_client")
            node = None
            
            # Try to reconnect if not connected
            if loro_client and not loro_client.connected:
                logger.info("[LoroSync] Client not connected, attempting reconnect...")
                loro_client.reconnect_sync()

            if loro_client and loro_client.connected:
                try:
                    node_data = loro_client.get_node(node_id)
                    if node_data:
                        node = NodeInfo(
                            id=node_id,
                            type=node_data.get("type", "unknown"),
                            position=node_data.get("position", {"x": 0, "y": 0}),
                            data=node_data.get("data", {}),
                            parent_id=node_data.get("parentId"),
                        )
                        logger.info(f"[LoroSync] Read node {node_id} from Loro")
                except Exception as e:
                    logger.error(f"[LoroSync] Failed to read node {node_id} from Loro: {e}")
                    # Fall back to backend
            
            # Fall back to backend if Loro not available or node not found
            if node is None:
                resolved_backend = backend(runtime) if callable(backend) else backend
                node = resolved_backend.read_node(
                    project_id=project_id,
                    node_id=node_id,
                )

            if node is None:
                return f"Node {node_id} not found."

            data = node.data or {}
            name = data.get("label") or data.get("name") or node.id
            description = data.get("description") or data.get("content") or ""
            text_part = {
                "type": "text",
                "text": (
                    f"{name}: {description} type: {node.type}"
                    if description
                    else name
                ),
            }


            # If the node is an image/video, return straightforward media + text parts
            if node.type in {"image", "video"}:
                from master_clash.utils import get_asset_base64

                def pick_source() -> str | None:
                    for key in (
                        "base64",
                        "src",
                        "url",
                        "thumbnail",
                        "poster",
                        "cover",
                    ):
                        value = data.get(key)
                        if isinstance(value, str) and value:
                            return value
                    return None

                def to_base64_and_mime(
                    source: str, default_mime: str
                ) -> tuple[str, str]:
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
                            pass
                        else:
                            base64_data, mime_type = to_base64_and_mime(
                                source, "image/jpeg"
                            )
                            media_part = {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{base64_data}"
                                },
                            }
                            return [media_part, text_part]
                    except Exception:
                        # If conversion fails, fall back to returning raw source + text
                        raw_part = (
                            {"type": "image_url", "image_url": source}
                            if node.type == "image"
                            else {"type": "media", "data": source}
                        )
                        return [raw_part, text_part]

                return [text_part]

            return [text_part]

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
            node_type: Literal["text", "group"] = Field(
                description="Node type to create (text for notes/scripts, group for organization). NOTE: For prompts with generation, use create_generation_node instead."
            )
            payload: CanvasNodeData = Field(
                description="Structured payload for text/prompt/group nodes"
            )
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

                # Write node directly to Loro CRDT (replaces SSE node_proposal)
                loro_sync_success = False
                loro_sync_error = None
                if result.proposal:
                    loro_client = runtime.config.get("configurable", {}).get("loro_client")
                    if loro_client and loro_client.connected:
                        try:
                            proposal = result.proposal
                            node_data = proposal.get("nodeData") or {}
                            parent_id_from_proposal = proposal.get("groupId")

                            if position is not None:
                                node_position = position
                            elif parent_id_from_proposal:
                                # ReactFlow expects child positions to be relative to parent.
                                node_position = {"x": 50.0, "y": 50.0}
                            else:
                                existing_nodes = loro_client.get_all_nodes() or {}
                                max_x = 0.0
                                max_y = 0.0
                                for existing in existing_nodes.values():
                                    existing_pos = (existing or {}).get("position") or {}
                                    try:
                                        max_x = max(max_x, float(existing_pos.get("x", 0.0)))
                                        max_y = max(max_y, float(existing_pos.get("y", 0.0)))
                                    except (TypeError, ValueError):
                                        continue
                                node_position = {"x": max_x + 120.0, "y": max_y + 80.0}

                            loro_node = {
                                "id": result.node_id,
                                "type": proposal.get("nodeType") or node_type,
                                "position": node_position,
                                "data": node_data,
                                **(
                                    {"parentId": parent_id_from_proposal}
                                    if parent_id_from_proposal
                                    else {}
                                ),
                            }

                            loro_client.add_node(result.node_id, loro_node)
                            loro_sync_success = True
                            logger.info(f"[LoroSync] Added node {result.node_id} to Loro")
                        except Exception as e:
                            loro_sync_error = str(e)
                            logger.error(f"[LoroSync] Failed to add node to Loro: {e}")
                    else:
                        loro_sync_error = "Loro client not connected"
                        logger.warning(f"[LoroSync] Loro client not available, node {result.node_id} not synced")

                # Return appropriate message based on sync status
                if loro_sync_success:
                    return f"Created node {result.node_id} (synced to canvas)"
                elif loro_sync_error:
                    return f"Error: Node {result.node_id} created in backend but failed to sync to canvas: {loro_sync_error}"
                else:
                    return f"Created node {result.node_id} (not synced - no Loro client)"

            except Exception as e:
                return f"Error creating node: {e}"

        return create_canvas_node

    def _create_generation_node_tool(self) -> BaseTool:
        """Create create_generation_node tool (image/video)."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        backend = self.backend

        class GenerationNodeData(BaseModel):
            label: str = Field(description="Content-based descriptive label for the node (e.g., 'Hero entering temple'). MUST NOT be generic like 'Generating image...' or 'Untitled'.")
            prompt: str | None = Field(default=None, description="Generation prompt sent to image/video AI models (e.g., detailed scene description for Imagen/Veo)")
            content: str | None = Field(default=None, description="Markdown content displayed to users (e.g., prompt notes, scene context). This is the visible prompt part of the merged PromptActionNode.")
            modelName: str | None = Field(  # noqa: N815
                default=None, description="Optional model name override"
            )
            actionType: Literal["image-gen", "video-gen"] | None = Field(  # noqa: N815
                default=None,
                description="Optional override; inferred from node_type when omitted",
            )
            upstreamNodeIds: list[str] = Field(  # noqa: N815
                default_factory=list,
                description="CRITICAL for video generation: List of upstream node IDs to connect. For video_gen, MUST include at least one completed image node ID to animate. For image_gen, upstreamNodeIds are optional."
            )

            class Config:
                extra = "allow"  # Preserve any additional metadata

        class CreateGenerationNodeInput(BaseModel):
            node_type: Literal["image_gen", "video_gen"] = Field(
                description="Generation node type to create"
            )
            payload: GenerationNodeData = Field(
                description="Structured payload for generation node"
            )
            position: dict[str, float] | None = Field(
                default=None, description="Optional canvas coordinates {x, y}"
            )
            parent_id: str | None = Field(
                default=None,
                description="Optional parent group; defaults to current workspace when omitted",
            )
            upstream_node_id: str | None = Field(
                default=None,
                description="Optional upstream node ID to connect from (e.g., another PromptActionNode or image node for video generation)",
            )

        @tool(args_schema=CreateGenerationNodeInput)
        def create_generation_node(
            node_type: str,
            payload: GenerationNodeData,
            runtime: ToolRuntime,
            position: dict[str, float] | None = None,
            parent_id: str | None = None,
            upstream_node_id: str | None = None,
        ) -> str:
            """Create a new PromptActionNode (merged prompt + generation action) on the canvas.

            This creates a unified node that contains both:
            - The prompt content (visible to users in the UI)
            - The generation action (image-gen or video-gen)
            
            Use 'prompt' field for the AI generation prompt, and 'content' for user-facing markdown notes.
            Then use run_generation_node to trigger the actual generation.
            Returns the nodeId for the created PromptActionNode.
            """

            project_id = runtime.state.get("project_id", "")

            # Auto-set parent_id from workspace if not explicitly provided
            if parent_id is None:
                workspace_group_id = runtime.state.get("workspace_group_id")
                if workspace_group_id:
                    parent_id = workspace_group_id

            resolved_backend = backend(runtime) if callable(backend) else backend

            # Prepare data with merged upstream IDs
            data_dict = payload.model_dump(exclude_none=True)
            final_upstream_ids = set(data_dict.get("upstreamNodeIds", []))
            if upstream_node_id:
                final_upstream_ids.add(upstream_node_id)
            data_dict["upstreamNodeIds"] = list(final_upstream_ids)

            try:
                result = resolved_backend.create_node(
                    project_id=project_id,
                    node_type=node_type,
                    data=data_dict,
                    position=position,
                    parent_id=parent_id,
                )

                if result.error:
                    return f"Error: {result.error}"

                # Write node directly to Loro CRDT (replaces SSE node_proposal)
                loro_sync_success = False
                loro_sync_error = None
                if result.proposal:
                    loro_client = runtime.config.get("configurable", {}).get("loro_client")
                    # Try to reconnect if not connected
                    if loro_client and not loro_client.connected:
                        logger.info("[LoroSync] Client not connected, attempting reconnect...")
                        loro_client.reconnect_sync()
                    
                    if loro_client and loro_client.connected:

                        try:
                            proposal = result.proposal
                            node_data = proposal.get("nodeData") or {}
                            parent_id_from_proposal = proposal.get("groupId")

                            if position is not None:
                                node_position = position
                            elif parent_id_from_proposal:
                                node_position = {"x": 50.0, "y": 50.0}
                            else:
                                existing_nodes = loro_client.get_all_nodes() or {}
                                max_x = 0.0
                                max_y = 0.0
                                for existing in existing_nodes.values():
                                    existing_pos = (existing or {}).get("position") or {}
                                    try:
                                        max_x = max(max_x, float(existing_pos.get("x", 0.0)))
                                        max_y = max(max_y, float(existing_pos.get("y", 0.0)))
                                    except (TypeError, ValueError):
                                        continue
                                node_position = {"x": max_x + 120.0, "y": max_y + 80.0}

                            loro_node = {
                                "id": result.node_id,
                                # Use 'action-badge' for React Flow (it uses actionType in data to distinguish)
                                "type": "action-badge" if node_type in ("image_gen", "video_gen") else (proposal.get("nodeType") or node_type),
                                "position": node_position,
                                "data": {
                                    **node_data,
                                    # Use the merged upstream IDs (from payload + upstream_node_id param)
                                    "upstreamNodeIds": list(final_upstream_ids),
                                    # Ensure actionType is set for ActionBadge component
                                    "actionType": "image-gen" if node_type == "image_gen" else ("video-gen" if node_type == "video_gen" else node_data.get("actionType")),
                                },
                                **(
                                    {"parentId": parent_id_from_proposal}
                                    if parent_id_from_proposal
                                    else {}
                                ),
                            }

                            loro_client.add_node(result.node_id, loro_node)
                            

                            
                            # Create edges for all upstream nodes
                            # Use final_upstream_ids calculated earlier
                            for up_id in final_upstream_ids:
                                edge_id = f"{up_id}-{result.node_id}"
                                loro_edge = {
                                    "id": edge_id,
                                    "source": up_id,
                                    "target": result.node_id,
                                    "type": "default"
                                }
                                loro_client.add_edge(edge_id, loro_edge)
                                logger.info(f"[LoroSync] Added edge {edge_id} from {up_id} to {result.node_id}")

                            loro_sync_success = True
                            logger.info(f"[LoroSync] Added generation node {result.node_id} to Loro")

                        except Exception as e:
                            loro_sync_error = str(e)
                            logger.error(f"[LoroSync] Failed to add generation node to Loro: {e}")
                    else:
                        loro_sync_error = "Loro client not connected"
                        logger.warning(f"[LoroSync] Loro client not available, generation node {result.node_id} not synced")

                # Return the actual node_id synced to Loro (not asset_id)
                # The Agent should use this ID for subsequent operations like run_generation_node
                sync_status = "(synced to canvas)" if loro_sync_success else f"(sync failed: {loro_sync_error})" if loro_sync_error else "(not synced)"
                
                # Always return result.node_id since that's what we added to Loro
                if loro_sync_error:
                    return f"Error: Generation node {result.node_id} created but failed to sync to canvas: {loro_sync_error}"
                return f"Created generation node {result.node_id} {sync_status}. Use this ID to run the generation."

            except Exception as e:
                return f"Error creating generation node: {e}"

        return create_generation_node

    def _update_node_tool(self) -> BaseTool:
        """Create update_canvas_node tool."""
        from langchain_core.tools import tool

        backend = self.backend

        class UpdateCanvasNodeInput(BaseModel):
            node_id: str = Field(description="Target node ID")
            data: dict[str, Any] | None = Field(
                default=None, description="Partial data update"
            )
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
            source_handle: str | None = Field(
                default=None, description="Optional source handle"
            )
            target_handle: str | None = Field(
                default=None, description="Optional target handle"
            )

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
        import asyncio

        backend = self.backend

        class WaitForGenerationInput(BaseModel):
            node_id: str = Field(description="id of generated asset node or assetId")
            timeout_seconds: float = Field(description="Max wait time in seconds")

        @tool(args_schema=WaitForGenerationInput)
        async def wait_for_generation(
            node_id: str,
            timeout_seconds: float,
            runtime: ToolRuntime,
        ) -> str:
            """Wait for a generated asset node to be ready"""

            project_id = runtime.state.get("project_id", "")
            
            # Try to get node status from Loro first (real-time state)
            loro_client = runtime.config.get("configurable", {}).get("loro_client")
            
            if loro_client and loro_client.connected:
                try:
                    # Poll Loro for node status with timeout
                    start_time = asyncio.get_event_loop().time()
                    while asyncio.get_event_loop().time() - start_time < timeout_seconds:
                        node_data = loro_client.get_node(node_id)
                        if node_data:
                            data = node_data.get("data", {})
                            status = data.get("status", "")
                            
                            # Check if node has src/url (generation complete)
                            if data.get("src") or data.get("url") or data.get("base64"):
                                logger.info(f"[LoroSync] Node {node_id} generation completed (has media)")
                                return "Task completed."
                            
                            if status == "completed":
                                logger.info(f"[LoroSync] Node {node_id} status: completed")
                                return "Task completed."
                            elif status == "failed":
                                error = data.get("error", "Unknown error")
                                return f"Task failed: {error}"
                            elif status in ("pending", "generating", ""):
                                # Still generating, wait and retry
                                await asyncio.sleep(1.0)
                                continue
                        else:
                            # Node not found yet, wait and retry
                            await asyncio.sleep(1.0)
                            continue
                    
                    # Timeout reached
                    return "Task still generating. Please retry wait_for_generation after a moment."
                    
                except Exception as e:
                    logger.error(f"[LoroSync] Error reading node {node_id} status: {e}")
                    # Fall back to backend
            
            # Fall back to backend if Loro not available
            resolved_backend = backend(runtime) if callable(backend) else backend
            try:
                result = await resolved_backend.wait_for_task(
                    project_id=project_id,
                    node_id=node_id,
                    timeout_seconds=timeout_seconds,
                )

                if result.error:
                    return f"Error: {result.error}"

                if result.status == "completed":
                    return "Task completed."
                elif result.status in ("pending", "generating"):
                    return "Task still generating. Please retry wait_for_generation after a moment."
                elif result.status == "failed":
                    return f"Task failed: {result.error}"
                else:
                    return f"Node not found: {node_id}"

            except Exception as e:
                return f"Error waiting for task: {e}"

        return wait_for_generation

    def _run_generation_node_tool(self) -> BaseTool:
        """Create run_generation_node tool."""
        from langchain_core.tools import tool
        import httpx

        backend = self.backend

        class RunGenerationNodeInput(BaseModel):
            node_id: str = Field(description="Generation node ID to run")

        @tool(args_schema=RunGenerationNodeInput)
        def run_generation_node(
            node_id: str,
            runtime: ToolRuntime,
        ) -> str:
            """Run a generation node (action-badge) to generate the asset.

            This triggers the actual generation by calling loro-sync-server API.
            The result will be automatically synced to the canvas via Loro.
            """

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            # Helper for strict dict conversion (defined early for use throughout function)
            def _ensure_dict(obj):
                if obj is None: return None
                if isinstance(obj, dict): return obj
                try:
                    if hasattr(obj, "to_json"): return obj.to_json()
                    if hasattr(obj, "to_dict"): return obj.to_dict()
                    if hasattr(obj, "value"): return obj.value
                except Exception as e:
                    logger.error(f"[RunGen] conversion failed: {e}")
                
                # Verify it is now a dict
                if isinstance(obj, dict): return obj
                # Fallback: empty dict if we can't convert, to prevent crashes
                logger.warning(f"[RunGen] Could not convert {type(obj)} to dict, returning empty dict")
                return {}

            try:
                # Read the existing node to get its configuration
                logger.info(f"[RunGen] ========== START run_generation_node for {node_id} ==========")
                node = resolved_backend.read_node(
                    project_id=project_id,
                    node_id=node_id,
                )
                
                logger.info(f"[RunGen] Backend read_node result: {node is not None}")

                if node is None:
                    # Fallback: Try checking Loro client directly (race condition handling)
                    loro_client = runtime.config.get("configurable", {}).get("loro_client")
                    logger.info(f"[RunGen] Loro client available: {loro_client is not None}, connected: {loro_client.connected if loro_client else False}")
                    
                    if loro_client and loro_client.connected:
                        raw_node = loro_client.get_node(node_id)
                        
                    if loro_client and loro_client.connected:
                        try:
                            # Direct access to doc using Frontend-style logic (get(id).value)
                            # This avoids full extraction overhead and potential serialization issues
                            doc = getattr(loro_client, "doc", None)
                            if doc:
                                nodes_map = doc.get_map("nodes")
                                proxy_node = nodes_map.get(node_id)
                                # Check if proxy_node exists and has .value
                                if proxy_node:
                                    logger.info(f"[RunGen] Found proxy node for {node_id}, accessing .value")
                                    # .value returns the Python dict for the map
                                    if hasattr(proxy_node, "value"):
                                        raw_node = proxy_node.value
                                    else:
                                        raw_node = proxy_node
                                else:
                                    raw_node = None
                            else:
                                # Fallback (unlikely needed if client connected)
                                raw_node = loro_client.get_node(node_id)
                            
                            raw_node = _ensure_dict(raw_node)
                            
                            if raw_node:
                                # Final safety check
                                if not isinstance(raw_node, dict) and hasattr(raw_node, "value"):
                                    raw_node = raw_node.value
                                
                                from dataclasses import dataclass
                                @dataclass
                                class SimpleNode:
                                    id: str
                                    type: str
                                    data: dict
                                
                                node = SimpleNode(
                                    id=node_id,
                                    type=raw_node.get("type"),
                                    data=raw_node.get("data", {})
                                )
                                logger.info(f"[RunGen] Node {node_id} constructed from Loro (.value access)")
                                logger.info(f"[RunGen] Node type: {node.type}, Node data keys: {list(node.data.keys()) if node.data else []}")
                        except Exception as e:
                            logger.error(f"[RunGen] Error in Loro fallback: {e}")
                            from dataclasses import dataclass
                            @dataclass
                            class SimpleNode:
                                id: str
                                type: str
                                data: dict
                            
                            node = SimpleNode(
                                id=node_id,
                                type=raw_node.get("type"),
                                data=raw_node.get("data", {})
                            )
                            logger.info(f"[RunGen] Node {node_id} found in Loro (backend lookup failed)")
                else:
                    logger.info(f"[RunGen] Node found via backend: type={node.type}, data keys={list(node.data.keys()) if hasattr(node, 'data') and node.data else []}")

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

                # Get prompt from node data (priority order: content > prompt field)
                # PRIORITY 1: Embedded content from PromptActionNode
                prompt = node.data.get("content", "") if node.data else ""
                
                # Filter out default placeholder content
                if prompt and prompt.strip() in ("# Prompt\nEnter your prompt here...", "# Prompt\\nEnter your prompt here..."):
                    logger.info("[RunGen] Ignoring default placeholder content")
                    prompt = ""
                
                # PRIORITY 2: Legacy prompt field (for backward compatibility)
                if not prompt:
                    prompt = node.data.get("prompt", "") if node.data else ""
                
                # PRIORITY 3: Try to read from connected prompt nodes via Loro
                loro_client = runtime.config.get("configurable", {}).get("loro_client")
                
                # Try to reconnect if not connected
                if loro_client and not loro_client.connected:
                    logger.info("[LoroSync] Client not connected, attempting reconnect...")
                    loro_client.reconnect_sync()
                
                if not prompt and loro_client and loro_client.connected:
                    logger.info("[RunGen] No embedded prompt, checking upstream nodes...")
                    # Get upstream nodes from node data or find connected prompt nodes
                    upstream_ids = node.data.get("upstreamNodeIds", []) if node.data else []
                    
                    # Helper for strict dict conversion
                    # (Removed duplicate definition)

                    for upstream_id in upstream_ids:
                        upstream_data = loro_client.get_node(upstream_id)
                        upstream_data = _ensure_dict(upstream_data)
                        
                        # Support 'prompt', 'text', 'text-input', 'prompt-node', 'action-badge'
                        if upstream_data and upstream_data.get("type") in ("prompt", "text", "text-input", "prompt-node", "action-badge"):
                            data = upstream_data.get("data", {})
                            # Check content first, then other fields
                            prompt = data.get("content") or data.get("text") or data.get("value") or data.get("prompt") or ""
                            if prompt:
                                logger.info(f"[RunGen] Found prompt from upstream node {upstream_id}")
                                break
                
                # STRICT VALIDATION: Ensure prompt exists
                if not prompt or not prompt.strip():
                    return f"Error: No prompt provided. Please edit the PromptActionNode or connect a prompt/text node to '{node_id}' before running generation."
                
                # STRICT VALIDATION for video: Ensure at least one image is connected
                if action_type == "video-gen":
                    upstream_ids = node.data.get("upstreamNodeIds", []) if node.data else []
                    logger.info(f"[RunGen] Initial upstreamNodeIds from node.data: {upstream_ids}")
                    logger.info(f"[RunGen] Full node.data content: {node.data if node.data else {}}")
                    
                    # Fallback: If upstreamNodeIds not set, try reading from Loro edges
                    if not upstream_ids and loro_client and loro_client.connected:
                        logger.info(f"[RunGen] upstreamNodeIds empty, reading from Loro edges...")
                        try:
                            all_edges = loro_client.get_all_edges() or {}
                            logger.info(f"[RunGen] Total edges in Loro: {len(all_edges)}")
                            incoming_edges = [e for e in all_edges.values() if e.get("target") == node_id]
                            logger.info(f"[RunGen] Incoming edges for {node_id}: {incoming_edges}")
                            upstream_ids = [e.get("source") for e in incoming_edges if e.get("source")]
                            logger.info(f"[RunGen] Found {len(upstream_ids)} upstream nodes from edges: {upstream_ids}")
                        except Exception as e:
                            logger.error(f"[RunGen] Error reading edges from Loro: {e}")
                            upstream_ids = []
                    
                    has_image = False
                    
                    logger.info(f"[RunGen] Video validation - checking {len(upstream_ids)} upstream nodes: {upstream_ids}")
                    
                    if loro_client and loro_client.connected:
                        for upstream_id in upstream_ids:
                            upstream_data = loro_client.get_node(upstream_id)
                            upstream_data = _ensure_dict(upstream_data)
                            
                            if upstream_data:
                                node_type = upstream_data.get("type")
                                logger.info(f"[RunGen] Upstream node {upstream_id}: type={node_type}")
                                
                                if node_type == "image":
                                    data = upstream_data.get("data", {})
                                    src = data.get("src")
                                    status = data.get("status")
                                    
                                    logger.info(f"[RunGen] Image node {upstream_id}: src={bool(src)}, status={status}")
                                    
                                    # Accept if: has src OR status is completed (more lenient)
                                    if src or status == "completed":
                                        has_image = True
                                        logger.info(f"[RunGen] ✅ Valid image found: {upstream_id}")
                                        break
                                    else:
                                        logger.warning(f"[RunGen] Image {upstream_id} not ready: src={src}, status={status}")
                    else:
                        logger.error(f"[RunGen] loro_client not connected! Cannot validate upstream images.")
                    
                    if not has_image:
                        return f"Error: Video generation requires at least one completed image node. Please connect an image node to the action-badge node '{node_id}' before running video generation. (Checked {len(upstream_ids)} upstream nodes)"
                
                # Generate asset ID for the new image node
                from master_clash.semantic_id import (
                    create_d1_checker,
                    generate_unique_id_for_project,
                )
                checker = create_d1_checker()
                asset_id = generate_unique_id_for_project(project_id, checker)
                
                gen_type = "image" if action_type == "image-gen" else "video"
                
                # Collect reference image URLs for video generation
                reference_image_urls = []
                if action_type == "video-gen" and loro_client and loro_client.connected:
                    for upstream_id in upstream_ids:
                        upstream_data = loro_client.get_node(upstream_id)
                        upstream_data = _ensure_dict(upstream_data)
                        
                        if upstream_data and upstream_data.get("type") == "image":
                            data = upstream_data.get("data", {})
                            src = data.get("src")
                            if src:
                                reference_image_urls.append(src)
                                logger.info(f"[RunGen] Added reference image URL from {upstream_id}: {src[:50]}...")
                    
                    logger.info(f"[RunGen] Collected {len(reference_image_urls)} reference image URLs for video generation")
                
                # Step 1: Create pending image/video node in Loro (frontend sees loading immediately)
                if loro_client and loro_client.connected:
                    # Get position relative to the action-badge node
                    action_node_data = loro_client.get_node(node_id)
                    action_node_data = _ensure_dict(action_node_data)
                    
                    # Safely extract position with proper fallback
                    action_pos = action_node_data.get("position") if action_node_data else None
                    if not action_pos or not isinstance(action_pos, dict) or "x" not in action_pos or "y" not in action_pos:
                        action_pos = {"x": 100, "y": 100}
                    
                    parent_id = action_node_data.get("parentId") if action_node_data else None
                    
                    # Build node data based on type
                    node_data = {
                        "label": f"Generating {gen_type}...",
                        "prompt": prompt,
                        "src": "",  # Empty = pending
                        "status": "generating",
                        "assetId": asset_id,
                        "sourceNodeId": node_id,  # Link back to action-badge
                    }
                    
                    # Add referenceImageUrls for video nodes
                    if gen_type == "video":
                        node_data["referenceImageUrls"] = reference_image_urls
                        node_data["duration"] = 5  # Default duration
                        node_data["model"] = "kling-v1"  # Default model
                    
                    pending_node = {
                        "id": asset_id,
                        "type": gen_type,  # "image" or "video"
                        "position": {
                            "x": float(action_pos.get("x", 100)) + 250,  # Next to action-badge
                            "y": float(action_pos.get("y", 100)),
                        },
                        "data": node_data,
                    }
                    if parent_id:
                        pending_node["parentId"] = parent_id
                    
                    # Step 2: Prepare atomic update
                    # We need the full existing node to update it via batch_set_nodes (which uses insert/replace)
                    full_action_node = {}
                    try:
                        doc = getattr(loro_client, "doc", None)
                        if doc:
                            nodes_map = doc.get_map("nodes")
                            p_node = nodes_map.get(node_id)
                            # Ensure we get a clean dictionary copy
                            if p_node and hasattr(p_node, "value"):
                                val = p_node.value
                                if isinstance(val, dict):
                                    full_action_node = val
                                else:
                                    # Recursive conversion fallback if .value is shallow (defensive)
                                    full_action_node = _ensure_dict(val)
                            else:
                                full_action_node = _ensure_dict(p_node)
                    except Exception as e:
                        logger.error(f"[RunGen] Safe read failed: {e}")
                    
                    if not full_action_node or not isinstance(full_action_node, dict):
                         # If we can't read it, we can't safely update it atomically with full replace
                         # Fallback to separate operations? No, user requested atomicity.
                         # But we should try to construct it from 'node' (SimpleNode) as best effort?
                         # Better to fail safely or warn? 
                         # Let's use the 'node' object we resolved earlier as base if Loro read failed
                         # But 'node' is SimpleNode, not full structure.
                         logger.warning(f"[RunGen] Could not read full node {node_id} for atomic update. Using partial update not possible with batch_set_nodes (insert).")
                         # Fallback: Just separate calls if read failed?
                         # Or reconstruct minimal node? 
                         # Let's try to proceed with separate calls if atomic prep fails, strictly for robustness.
                         pass

                    if full_action_node and isinstance(full_action_node, dict):
                        # Merge updates locally
                        current_data = full_action_node.get("data", {})
                        if not isinstance(current_data, dict): current_data = {}
                        
                        current_data["assetId"] = asset_id
                        current_data["status"] = "generating"
                        full_action_node["data"] = current_data
                        
                        # Ensure edge exists
                        edge_id = f"e-{node_id}-{asset_id}"
                        new_edge = {
                            "id": edge_id,
                            "source": node_id,
                            "target": asset_id,
                            "type": "default",
                        }

                        # ATOMIC BATCH WRITE (Nodes + Edges)
                        loro_client.batch_update_graph(
                            nodes={
                                asset_id: pending_node,
                                node_id: full_action_node
                            },
                            edges={
                                edge_id: new_edge
                            }
                        )
                        logger.info(f"[RunGen] Atomic graph update completed (Created {asset_id}, Edge {edge_id}, Updated {node_id})")
                        return f"Generation triggered for {gen_type} node {asset_id}. Watch canvas for updates."
                    else:
                         # Fallback to separate ops if we couldn't get full node (should not happen given we found 'node' earlier)
                         logger.warning("[RunGen] Full node read failed, falling back to non-atomic separation")
                         loro_client.add_node(asset_id, pending_node)
                         loro_client.update_node(node_id, {
                            "data": {
                                "assetId": asset_id,
                                "status": "generating",
                            }
                         })
                         # Also add edge separately
                         edge_id = f"e-{node_id}-{asset_id}"
                         loro_client.add_edge(edge_id, {
                            "id": edge_id,
                            "source": node_id,
                            "target": asset_id,
                            "type": "default",
                        })
                         return f"Generation triggered for {gen_type} node {asset_id}. Watch canvas for updates."
                else:
                    return f"Error: Loro not connected, cannot create pending node"

            except Exception as e:
                import traceback
                logger.error(f"[RunGen] CRITICAL ERROR TRACEBACK:\n{traceback.format_exc()}")
                return f"Error running generation node: {e}"

        return run_generation_node


    def _search_nodes_tool(self) -> BaseTool:
        """Create search_canvas tool."""
        from langchain_core.tools import tool

        backend = self.backend

        class SearchCanvasInput(BaseModel):
            query: str = Field(description="Search query")
            node_types: list[str] | None = Field(
                default=None, description="Optional filter by node types"
            )

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
