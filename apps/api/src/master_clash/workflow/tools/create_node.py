"""
Create Node Tool

Provides the create_canvas_node tool for creating text/group nodes.
"""

import logging
from typing import Any, Literal

from langchain.tools import BaseTool, ToolRuntime
from pydantic import BaseModel, Field

from master_clash.workflow.backends import CanvasBackendProtocol

logger = logging.getLogger(__name__)


def create_create_node_tool(backend: CanvasBackendProtocol) -> BaseTool:
    """Create create_canvas_node tool."""
    from langchain_core.tools import tool

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
            extra = "allow"

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

            # Write node directly to Loro CRDT
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

            if loro_sync_success:
                return f"Created node {result.node_id} (synced to canvas)"
            elif loro_sync_error:
                return f"Error: Node {result.node_id} created in backend but failed to sync to canvas: {loro_sync_error}"
            else:
                return f"Created node {result.node_id} (not synced - no Loro client)"

        except Exception as e:
            return f"Error creating node: {e}"

    return create_canvas_node
