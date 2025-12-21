"""
Run Generation Tool

Provides the run_generation_node tool for triggering image/video generation.
This is the most complex tool as it orchestrates the entire generation process.
"""

import logging
from dataclasses import dataclass
from typing import Any

from langchain.tools import BaseTool, ToolRuntime
from pydantic import BaseModel, Field

from master_clash.workflow.backends import CanvasBackendProtocol

logger = logging.getLogger(__name__)


def _ensure_dict(obj: Any) -> dict:
    """Helper for strict dict conversion."""
    if obj is None:
        return {}
    if isinstance(obj, dict):
        return obj
    try:
        if hasattr(obj, "to_json"):
            return obj.to_json()
        if hasattr(obj, "to_dict"):
            return obj.to_dict()
        if hasattr(obj, "value"):
            return obj.value
    except Exception as e:
        logger.error(f"[RunGen] conversion failed: {e}")

    if isinstance(obj, dict):
        return obj
    logger.warning(f"[RunGen] Could not convert {type(obj)} to dict, returning empty dict")
    return {}


def create_run_generation_tool(backend: CanvasBackendProtocol) -> BaseTool:
    """Create run_generation_node tool."""
    from langchain_core.tools import tool

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

        try:
            logger.info(f"[RunGen] ========== START run_generation_node for {node_id} ==========")
            node = resolved_backend.read_node(
                project_id=project_id,
                node_id=node_id,
            )

            logger.info(f"[RunGen] Backend read_node result: {node is not None}")

            if node is None:
                # Fallback: Try checking Loro client directly
                loro_client = runtime.config.get("configurable", {}).get("loro_client")
                logger.info(f"[RunGen] Loro client available: {loro_client is not None}, connected: {loro_client.connected if loro_client else False}")

                raw_node = None
                if loro_client and loro_client.connected:
                    try:
                        doc = getattr(loro_client, "doc", None)
                        if doc:
                            nodes_map = doc.get_map("nodes")
                            proxy_node = nodes_map.get(node_id)
                            if proxy_node:
                                logger.info(f"[RunGen] Found proxy node for {node_id}, accessing .value")
                                if hasattr(proxy_node, "value"):
                                    raw_node = proxy_node.value
                                else:
                                    raw_node = proxy_node
                            else:
                                raw_node = None
                        else:
                            raw_node = loro_client.get_node(node_id)

                        raw_node = _ensure_dict(raw_node)

                        if raw_node:
                            if not isinstance(raw_node, dict) and hasattr(raw_node, "value"):
                                raw_node = raw_node.value

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
            else:
                logger.info(f"[RunGen] Node found via backend: type={node.type}, data keys={list(node.data.keys()) if hasattr(node, 'data') and node.data else []}")

            if node is None:
                return f"Error: Node {node_id} not found"

            # Verify it's a generation node
            if node.type != "action-badge":
                return f"Error: Node {node_id} is not a generation node (type: {node.type})"

            action_type = node.data.get("actionType") if node.data else None
            if action_type not in ("image-gen", "video-gen"):
                return f"Error: Node {node_id} is not a generation node (actionType: {action_type})"

            # Get prompt from node data
            prompt = node.data.get("content", "") if node.data else ""

            if prompt and prompt.strip() in ("# Prompt\nEnter your prompt here...", "# Prompt\\nEnter your prompt here..."):
                logger.info("[RunGen] Ignoring default placeholder content")
                prompt = ""

            if not prompt:
                prompt = node.data.get("prompt", "") if node.data else ""

            # Try to read from connected prompt nodes via Loro
            loro_client = runtime.config.get("configurable", {}).get("loro_client")

            if loro_client and not loro_client.connected:
                logger.info("[LoroSync] Client not connected, attempting reconnect...")
                loro_client.reconnect_sync()

            if not prompt and loro_client and loro_client.connected:
                logger.info("[RunGen] No embedded prompt, checking upstream nodes...")
                upstream_ids = node.data.get("upstreamNodeIds", []) if node.data else []

                for upstream_id in upstream_ids:
                    upstream_data = loro_client.get_node(upstream_id)
                    upstream_data = _ensure_dict(upstream_data)

                    if upstream_data and upstream_data.get("type") in ("prompt", "text", "text-input", "prompt-node", "action-badge"):
                        data = upstream_data.get("data", {})
                        prompt = data.get("content") or data.get("text") or data.get("value") or data.get("prompt") or ""
                        if prompt:
                            logger.info(f"[RunGen] Found prompt from upstream node {upstream_id}")
                            break

            if not prompt or not prompt.strip():
                return f"Error: No prompt provided. Please edit the PromptActionNode or connect a prompt/text node to '{node_id}' before running generation."

            # Validate video generation requirements
            upstream_ids = node.data.get("upstreamNodeIds", []) if node.data else []
            if action_type == "video-gen":
                logger.info(f"[RunGen] Initial upstreamNodeIds from node.data: {upstream_ids}")

                if not upstream_ids and loro_client and loro_client.connected:
                    logger.info(f"[RunGen] upstreamNodeIds empty, reading from Loro edges...")
                    try:
                        all_edges = loro_client.get_all_edges() or {}
                        incoming_edges = [e for e in all_edges.values() if e.get("target") == node_id]
                        upstream_ids = [e.get("source") for e in incoming_edges if e.get("source")]
                        logger.info(f"[RunGen] Found {len(upstream_ids)} upstream nodes from edges: {upstream_ids}")
                    except Exception as e:
                        logger.error(f"[RunGen] Error reading edges from Loro: {e}")
                        upstream_ids = []

                has_image = False
                if loro_client and loro_client.connected:
                    for upstream_id in upstream_ids:
                        upstream_data = loro_client.get_node(upstream_id)
                        upstream_data = _ensure_dict(upstream_data)

                        if upstream_data and upstream_data.get("type") == "image":
                            data = upstream_data.get("data", {})
                            src = data.get("src")
                            status = data.get("status")

                            if src or status == "completed":
                                has_image = True
                                logger.info(f"[RunGen] ✅ Valid image found: {upstream_id}")
                                break

                if not has_image:
                    return f"Error: Video generation requires at least one completed image node. Please connect an image node to the action-badge node '{node_id}' before running video generation. (Checked {len(upstream_ids)} upstream nodes)"

            # Generate asset ID
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

            # Create pending node in Loro
            if loro_client and loro_client.connected:
                action_node_data = loro_client.get_node(node_id)
                action_node_data = _ensure_dict(action_node_data)

                action_pos = action_node_data.get("position") if action_node_data else None
                if not action_pos or not isinstance(action_pos, dict) or "x" not in action_pos or "y" not in action_pos:
                    action_pos = {"x": 100, "y": 100}

                parent_id = action_node_data.get("parentId") if action_node_data else None

                node_data = {
                    "label": f"Generating {gen_type}...",
                    "prompt": prompt,
                    "src": "",
                    "status": "generating",
                    "assetId": asset_id,
                    "sourceNodeId": node_id,
                }

                if gen_type == "video":
                    node_data["referenceImageUrls"] = reference_image_urls
                    node_data["duration"] = 5
                    node_data["model"] = "kling-v1"

                pending_node = {
                    "id": asset_id,
                    "type": gen_type,
                    "position": {
                        "x": float(action_pos.get("x", 100)) + 250,
                        "y": float(action_pos.get("y", 100)),
                    },
                    "data": node_data,
                }
                if parent_id:
                    pending_node["parentId"] = parent_id

                # Prepare atomic update
                full_action_node = {}
                try:
                    doc = getattr(loro_client, "doc", None)
                    if doc:
                        nodes_map = doc.get_map("nodes")
                        p_node = nodes_map.get(node_id)
                        if p_node and hasattr(p_node, "value"):
                            val = p_node.value
                            if isinstance(val, dict):
                                full_action_node = val
                            else:
                                full_action_node = _ensure_dict(val)
                        else:
                            full_action_node = _ensure_dict(p_node)
                except Exception as e:
                    logger.error(f"[RunGen] Safe read failed: {e}")

                if full_action_node and isinstance(full_action_node, dict):
                    current_data = full_action_node.get("data", {})
                    if not isinstance(current_data, dict):
                        current_data = {}

                    current_data["assetId"] = asset_id
                    current_data["status"] = "generating"
                    full_action_node["data"] = current_data

                    edge_id = f"e-{node_id}-{asset_id}"
                    new_edge = {
                        "id": edge_id,
                        "source": node_id,
                        "target": asset_id,
                        "type": "default",
                    }

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
                    logger.warning("[RunGen] Full node read failed, falling back to non-atomic separation")
                    loro_client.add_node(asset_id, pending_node)
                    loro_client.update_node(node_id, {
                        "data": {
                            "assetId": asset_id,
                            "status": "generating",
                        }
                    })
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
