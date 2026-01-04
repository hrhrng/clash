import json
import uuid
from typing import Any

from langchain_core.tools import tool

from master_clash.context import find_node_by_id, get_asset_id, get_project_context
from master_clash.semantic_id import create_d1_checker, generate_unique_id_for_project


@tool
def list_node_info(project_id: str) -> str:
    """
    Scans the canvas and returns structured semantic information of all nodes.
    Useful for understanding the current state of the project.
    """
    context = get_project_context(project_id, force_refresh=True)
    if not context:
        return "No context found for this project."

    nodes_info = []
    for node in context.nodes:
        info = {
            "id": node.id,
            "type": node.type,
            "label": node.data.get("label", "Untitled"),
            "parentId": node.parentId
        }
        nodes_info.append(info)

    return json.dumps(nodes_info, indent=2)

@tool
def read_node(project_id: str, node_id: str) -> str:
    """
    Reads the content of a specific node (text, image, video).
    """
    context = get_project_context(project_id, force_refresh=True)
    if not context:
        return "No context found."

    node = find_node_by_id(node_id, context)
    if not node:
        return f"Node {node_id} not found."

    # Return relevant data based on node type
    return json.dumps(node.data, indent=2)

@tool
def create_node(project_id: str, type: str, data: dict[str, Any], group_id: str | None = None, upstream_node_ids: list[str] | None = None) -> str:
    """
    Creates a multimodal node on the canvas.

    Args:
        project_id: The project ID.
        type: The type of node (e.g., 'text', 'image', 'video', 'group', 'prompt', 'action-badge-image').
        data: The data for the node (e.g., content, label).
        group_id: Optional parent group ID.
        upstream_node_ids: Optional upstream node IDs for connections.

    Returns:
        A JSON string representing the proposal that was sent to the UI.
    """
    # This tool doesn't directly modify the context (which is frontend-driven).
    # Instead, it returns a "Proposal" object that the system will intercept and send to the frontend.
    # The frontend will then create the node and update the context.

    # Generate semantic ID for node
    checker = create_d1_checker()
    node_id = generate_unique_id_for_project(project_id, checker)

    # Proposal ID remains temporary UUID
    proposal_id = f"proposal-{uuid.uuid4().hex[:8]}"

    # Map high-level types to frontend types if needed
    node_type = type
    if type == "text":
        node_type = "text"
    elif type == "group":
        node_type = "group"
    elif type == "prompt":
        node_type = "prompt"
    elif type == "image_gen":
        node_type = "action-badge-image"
        type = "generative" # Frontend expects 'generative' for the proposal type wrapper?

    # Set default dimensions based on node type (matching frontend ProjectEditor.tsx)
    default_width = 300
    default_height = 300
    if node_type == "group":
        default_width = 400
        default_height = 400
    elif node_type == "action-badge":
        default_width = 320
        default_height = 220

    proposal = {
        "id": proposal_id,
        "type": "generative" if type == "image_gen" or type == "video_gen" else "simple", # Simplified logic
        "nodeType": node_type,
        "nodeData": {
            "id": node_id,
            **data
        },
        "groupId": group_id,
        "upstreamNodeIds": upstream_node_ids,
        "message": f"Proposed {type} node: {data.get('label', 'Untitled')}",
        # ReactFlow node properties - critical for proper rendering
        "width": default_width,
        "height": default_height,
        "style": {
            "width": default_width,
            "height": default_height,
        }
    }

    if type == "group":
        proposal["type"] = "group"

    # We return the proposal as a JSON string.
    # The calling code (StreamEmitter adapter) needs to parse this and emit the event.
    return json.dumps({
        "action": "create_node_proposal",
        "proposal": proposal
    })

@tool
def wait_for_task(project_id: str, node_id: str) -> str:
    """
    Queries the generation task status for a specific node.
    Returns the asset ID if completed, or "generating" / "failed".
    """
    context = get_project_context(project_id, force_refresh=True)
    if not context:
        return "No context found."

    asset_id = get_asset_id(node_id, context)
    if asset_id:
        return f"completed: {asset_id}"

    # In a real scenario, we might check if the node exists and has a 'loading' state.
    # For now, if asset_id is missing but node exists, we assume it's generating or not started.
    node = find_node_by_id(node_id, context)
    if node:
        return "generating"

    return "node_not_found"

@tool
def timeline_editor(project_id: str, action: str, params: dict[str, Any]) -> str:
    """
    Automated video editor tool.
    Actions: 'add_clip', 'set_duration', 'add_audio', 'render'.
    """
    return json.dumps({
        "action": "timeline_edit",
        "edit_action": action,
        "params": params
    })
