"""
Arrange Timeline Tool

Provides the arrange_images_in_timeline tool for arranging assets in a video editor node.
"""

import logging
from typing import Any

from langchain.tools import BaseTool, ToolRuntime
from pydantic import BaseModel, Field

from master_clash.workflow.backends import CanvasBackendProtocol
from master_clash.workflow.share_types import TimelineDSL, VideoTrack, VideoTrackItem

logger = logging.getLogger(__name__)


def create_arrange_timeline_tool(backend: CanvasBackendProtocol) -> BaseTool:
    """Create arrange_images_in_timeline tool."""
    from langchain_core.tools import tool

    class ArrangeTimelineInput(BaseModel):
        editor_node_id: str = Field(
            description="ID of the Video Editor node to arrange assets in"
        )
        asset_ids: list[str] = Field(
            description="List of asset node IDs to arrange in the timeline"
        )
        duration_per_image: int = Field(
            default=90,
            description="Duration in frames for each image (default 90 frames = 3s at 30fps)"
        )

    @tool(args_schema=ArrangeTimelineInput)
    def arrange_images_in_timeline(
        editor_node_id: str,
        asset_ids: list[str],
        runtime: ToolRuntime,
        duration_per_image: int = 90,
    ) -> str:
        """Arrange a list of image/asset nodes sequentially in the video editor timeline."""
        project_id = runtime.state.get("project_id", "")

        logger.info(f"[arrange_timeline] Arranging {len(asset_ids)} assets in editor {editor_node_id}")

        resolved_backend = backend(runtime) if callable(backend) else backend

        try:
            # 1. Get the Editor Node
            editor_node = resolved_backend.get_node(project_id, editor_node_id)
            if not editor_node:
                return f"Error: Video Editor node {editor_node_id} not found."

            if editor_node.get("type") != "video-editor":
                return f"Error: Node {editor_node_id} is not a video-editor node (found {editor_node.get('type')})."

            # 2. Get Asset Nodes to verify they exist and get details
            valid_assets = []
            for asset_id in asset_ids:
                node = resolved_backend.get_node(project_id, asset_id)
                if node:
                    valid_assets.append(node)
                else:
                    logger.warning(f"[arrange_timeline] Asset node {asset_id} not found, skipping.")

            if not valid_assets:
                return "Error: No valid asset nodes found to arrange."

            # 3. Construct Timeline DSL
            # We will create a single track with sequential items

            # Current DSL (or default)
            current_dsl_data = editor_node.get("data", {}).get("timelineDsl") or {}
            # Check if we should merge or overwrite? For this tool, let's assume "arrange these specific images" implies creating a sequence.
            # But usually we want to append or overwrite. Let's overwrite the 'main' track for simplicity of "arrange".

            # Initialize DSL structure
            dsl = TimelineDSL(**current_dsl_data) if current_dsl_data else TimelineDSL()

            # Create items
            items = []
            current_frame = 0

            for asset in valid_assets:
                # Determine type
                asset_type = asset.get("type", "image")
                if asset_type not in ["video", "image", "text", "audio"]:
                    asset_type = "image" # Default fallback

                # Determine duration
                # If video/audio, try to use its natural duration if available?
                # For now, simplistic approach: use provided duration_per_image for everything unless it's known video
                # But prompt specifically asked for "arrange images", so fixed duration is appropriate.

                item = VideoTrackItem(
                    id=f"clip-{asset['id']}-{current_frame}",
                    type=asset_type,
                    assetId=asset['id'],
                    from_=current_frame,
                    durationInFrames=duration_per_image,
                    startAt=0
                )
                items.append(item)
                current_frame += duration_per_image

            # Create or Update Track
            # Find existing main track
            main_track_index = -1
            for i, track in enumerate(dsl.tracks):
                if track.type == "main":
                    main_track_index = i
                    break

            new_track = VideoTrack(
                id=f"track-main-{len(dsl.tracks)}",
                name="Main Sequence",
                type="main",
                items=items
            )

            if main_track_index >= 0:
                dsl.tracks[main_track_index] = new_track
            else:
                dsl.tracks.append(new_track)

            # Update duration
            dsl.durationInFrames = current_frame

            # 4. Update Node
            # We need to update the node's data with the new DSL
            update_data = {
                "timelineDsl": dsl.model_dump()
            }

            # Ensure edges exist between assets and editor node (Strong Correlation)
            edge_updates = {}
            existing_edges = {}

            loro_client = runtime.config.get("configurable", {}).get("loro_client")
            if loro_client and loro_client.connected:
                existing_edges = loro_client.get_all_edges() or {}

            for asset in valid_assets:
                asset_id = asset['id']
                # Check if edge already exists
                # Frontend uses format: edge-{assetId}-{editorId}-assets
                # We should try to match or just ensure *an* edge exists
                edge_exists = False

                # Check if any edge connects source=asset_id to target=editor_node_id
                if existing_edges:
                    for edge in existing_edges.values():
                        if edge.get('source') == asset_id and edge.get('target') == editor_node_id:
                            edge_exists = True
                            break

                if not edge_exists:
                    # Create new edge
                    # Use frontend naming convention if possible for consistency, though ID uniqueness is what matters
                    edge_id = f"edge-{asset_id}-{editor_node_id}-assets"
                    new_edge = {
                        "id": edge_id,
                        "source": asset_id,
                        "target": editor_node_id,
                        "targetHandle": "assets", # Important for VideoEditorNode to pick it up
                        "type": "default"
                    }
                    edge_updates[edge_id] = new_edge
                    logger.info(f"[arrange_timeline] Creating dependency edge: {edge_id}")

            result = resolved_backend.update_node(
                project_id=project_id,
                node_id=editor_node_id,
                data=update_data
            )

            if result.error:
                return f"Error updating editor node: {result.error}"

            # Sync to Loro
            if loro_client and loro_client.connected:
                try:
                    # Batch update: Node data + New Edges
                    batch_nodes = {
                        editor_node_id: {"data": update_data}
                    }

                    if edge_updates:
                        loro_client.batch_update_graph(
                            nodes=batch_nodes,
                            edges=edge_updates
                        )
                        logger.info(f"[arrange_timeline] Synced DSL update and {len(edge_updates)} new edges to Loro")
                    else:
                        loro_client.update_node(editor_node_id, {"data": update_data})
                        logger.info(f"[arrange_timeline] Synced DSL update to Loro for {editor_node_id}")

                except Exception as e:
                    logger.error(f"[arrange_timeline] Loro sync failed: {e}")
                    return f"Arranged timeline locally but Loro sync failed: {e}"

            return f"Successfully arranged {len(items)} assets in Video Editor {editor_node_id}. Total duration: {dsl.durationInFrames} frames."

        except Exception as e:
            logger.error(f"[arrange_timeline] Failed: {e}", exc_info=True)
            return f"Error arranging timeline: {str(e)}"

    return arrange_images_in_timeline
