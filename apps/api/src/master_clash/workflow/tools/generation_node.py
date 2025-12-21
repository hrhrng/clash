"""
Generation Node Tool

Provides the create_generation_node tool for creating image/video generation nodes.
"""

import logging
from typing import Literal

from langchain.tools import BaseTool, ToolRuntime
from pydantic import BaseModel, Field

from master_clash.workflow.backends import CanvasBackendProtocol

logger = logging.getLogger(__name__)


def create_generation_node_tool(backend: CanvasBackendProtocol) -> BaseTool:
    """Create create_generation_node tool (image/video)."""
    from langchain_core.tools import tool

    class GenerationNodeData(BaseModel):
        label: str = Field(
            description="Content-based descriptive label for the node (e.g., 'Hero entering temple'). MUST NOT be generic like 'Generating image...' or 'Untitled'."
        )
        prompt: str | None = Field(
            default=None,
            description="Generation prompt sent to image/video AI models (e.g., detailed scene description for Imagen/Veo)"
        )
        content: str | None = Field(
            default=None,
            description="Markdown content displayed to users (e.g., prompt notes, scene context). This is the visible prompt part of the merged PromptActionNode."
        )
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
            extra = "allow"

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

            # Write node directly to Loro CRDT
            loro_sync_success = False
            loro_sync_error = None
            if result.proposal:
                loro_client = runtime.config.get("configurable", {}).get("loro_client")
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
                            "type": "action-badge" if node_type in ("image_gen", "video_gen") else (proposal.get("nodeType") or node_type),
                            "position": node_position,
                            "data": {
                                **node_data,
                                "upstreamNodeIds": list(final_upstream_ids),
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

            sync_status = "(synced to canvas)" if loro_sync_success else f"(sync failed: {loro_sync_error})" if loro_sync_error else "(not synced)"

            if loro_sync_error:
                return f"Error: Generation node {result.node_id} created but failed to sync to canvas: {loro_sync_error}"
            return f"Created generation node {result.node_id} {sync_status}. Use this ID to run the generation."

        except Exception as e:
            return f"Error creating generation node: {e}"

    return create_generation_node
