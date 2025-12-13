"""
Canvas manipulation tools for agents to create and manage nodes on the canvas.
"""

import logging
from typing import Any

from langchain_core.tools import tool

logger = logging.getLogger(__name__)


# ========================================
# Canvas State Management
# ========================================

class CanvasState:
    """
    Maintains the state of the canvas including all nodes and groups.
    This is a simplified in-memory representation that can be synced with frontend.
    """
    def __init__(self):
        self.nodes: dict[str, dict[str, Any]] = {}
        self.groups: dict[str, dict[str, Any]] = {}
        self.edges: list[dict[str, Any]] = []

    def add_group(self, group_id: str, label: str, parent_id: str | None = None):
        """Add a group to the canvas"""
        self.groups[group_id] = {
            "id": group_id,
            "type": "group",
            "label": label,
            "parent_id": parent_id,
            "children": []
        }
        logger.info(f"Created group: {group_id} - {label}")
        return self.groups[group_id]

    def add_node(self, node_id: str, node_type: str, label: str,
                 content: Any, parent_id: str | None = None):
        """Add a node to the canvas"""
        self.nodes[node_id] = {
            "id": node_id,
            "type": node_type,
            "label": label,
            "content": content,
            "parent_id": parent_id
        }

        # Add to parent group if specified
        if parent_id and parent_id in self.groups:
            self.groups[parent_id]["children"].append(node_id)

        logger.info(f"Created {node_type} node: {node_id} - {label}")
        return self.nodes[node_id]

    def add_edge(self, source_id: str, target_id: str):
        """Add an edge between two nodes"""
        edge = {
            "source": source_id,
            "target": target_id
        }
        self.edges.append(edge)
        logger.info(f"Created edge: {source_id} -> {target_id}")
        return edge

    def get_group_context(self, group_id: str) -> dict[str, Any]:
        """Get semantic context of a group including all its children"""
        if group_id not in self.groups:
            return {}

        group = self.groups[group_id]
        context = {
            "group": group,
            "children": []
        }

        for child_id in group.get("children", []):
            if child_id in self.nodes:
                context["children"].append(self.nodes[child_id])

        return context

    def get_canvas_summary(self) -> str:
        """Get a summary of the entire canvas state"""
        summary = "Canvas State:\n"
        summary += f"- Groups: {len(self.groups)}\n"
        summary += f"- Nodes: {len(self.nodes)}\n"
        summary += f"- Edges: {len(self.edges)}\n\n"

        for group_id, group in self.groups.items():
            summary += f"Group '{group['label']}' ({group_id}): "
            summary += f"{len(group['children'])} children\n"

        return summary


# Global canvas state (in practice, this would be per-session)
_canvas_state = CanvasState()


def get_canvas_state() -> CanvasState:
    """Get the current canvas state"""
    return _canvas_state


def reset_canvas_state():
    """Reset canvas state (useful for testing)"""
    global _canvas_state
    _canvas_state = CanvasState()


# ========================================
# Tool Definitions
# ========================================

@tool
def create_group(label: str, group_id: str, parent_id: str | None = None) -> dict:
    """
    Create a new group on the canvas to organize related nodes.

    Args:
        label: Name/title of the group (e.g., "Scene 1: Opening", "Character Designs")
        group_id: Unique identifier for this group (e.g., "group-scene1", "group-characters")
        parent_id: Optional parent group ID if this is a nested group

    Returns:
        Dictionary with group information
    """
    canvas = get_canvas_state()
    canvas.add_group(group_id, label, parent_id)
    return {
        "success": True,
        "group_id": group_id,
        "label": label,
        "message": f"Created group '{label}'"
    }


@tool
def create_text_node(
    label: str,
    content: str,
    node_id: str,
    parent_id: str | None = None,
    upstream_id: str | None = None
) -> dict:
    """
    Create a text node on the canvas for storing script, notes, or other textual content.

    Args:
        label: Short title for the node (e.g., "Script", "Director's Notes")
        content: The actual text content
        node_id: Unique identifier for this node (e.g., "text-script", "text-notes-1")
        parent_id: Optional group ID this node belongs to
        upstream_id: Optional node ID to connect from (creates an edge)

    Returns:
        Dictionary with node information
    """
    canvas = get_canvas_state()
    canvas.add_node(node_id, "text", label, content, parent_id)

    if upstream_id:
        canvas.add_edge(upstream_id, node_id)

    return {
        "success": True,
        "node_id": node_id,
        "type": "text",
        "label": label,
        "message": f"Created text node '{label}'"
    }


@tool
def create_image_generation_node(
    label: str,
    prompt: str,
    node_id: str,
    parent_id: str | None = None,
    upstream_id: str | None = None,
    reference_images: list[str] | None = None
) -> dict:
    """
    Create an image generation node that will generate a visual based on the prompt.

    Args:
        label: Short description (e.g., "Hero Portrait", "Establishing Shot")
        prompt: Detailed image generation prompt
        node_id: Unique identifier (e.g., "img-hero", "img-scene1-shot1")
        parent_id: Optional group ID this node belongs to
        upstream_id: Optional node ID to connect from
        reference_images: Optional list of reference image node IDs for style consistency

    Returns:
        Dictionary with node information
    """
    canvas = get_canvas_state()

    content = {
        "prompt": prompt,
        "reference_images": reference_images or [],
        "status": "pending"  # pending, generating, completed, error
    }

    canvas.add_node(node_id, "image_generation", label, content, parent_id)

    if upstream_id:
        canvas.add_edge(upstream_id, node_id)

    return {
        "success": True,
        "node_id": node_id,
        "type": "image_generation",
        "label": label,
        "message": f"Created image generation node '{label}'"
    }


@tool
def create_video_generation_node(
    label: str,
    prompt: str,
    node_id: str,
    source_image_id: str,
    parent_id: str | None = None,
    upstream_id: str | None = None,
    duration: float = 5.0
) -> dict:
    """
    Create a video generation node that animates a source image.

    Args:
        label: Short description (e.g., "Hero Walks", "Camera Pan")
        prompt: Video generation/animation prompt
        node_id: Unique identifier (e.g., "vid-hero-walk", "vid-scene1-shot1")
        source_image_id: ID of the source image node to animate
        parent_id: Optional group ID this node belongs to
        upstream_id: Optional node ID to connect from (usually the source image)
        duration: Video duration in seconds

    Returns:
        Dictionary with node information
    """
    canvas = get_canvas_state()

    content = {
        "prompt": prompt,
        "source_image_id": source_image_id,
        "duration": duration,
        "status": "pending"
    }

    canvas.add_node(node_id, "video_generation", label, content, parent_id)

    # Always connect from source image
    canvas.add_edge(source_image_id, node_id)

    if upstream_id and upstream_id != source_image_id:
        canvas.add_edge(upstream_id, node_id)

    return {
        "success": True,
        "node_id": node_id,
        "type": "video_generation",
        "label": label,
        "message": f"Created video generation node '{label}'"
    }


@tool
def get_group_context_tool(group_id: str) -> dict:
    """
    Get the semantic context of a group including all its children nodes.
    Useful for understanding what's already created in a group before adding more.

    Args:
        group_id: The group ID to query

    Returns:
        Dictionary with group information and its children
    """
    canvas = get_canvas_state()
    context = canvas.get_group_context(group_id)

    return {
        "success": True,
        "context": context,
        "message": f"Retrieved context for group '{group_id}'"
    }


@tool
def get_canvas_summary_tool() -> dict:
    """
    Get a high-level summary of the entire canvas state.
    Useful for the supervisor to understand the overall progress.

    Returns:
        Dictionary with canvas summary
    """
    canvas = get_canvas_state()
    summary = canvas.get_canvas_summary()

    return {
        "success": True,
        "summary": summary,
        "groups": list(canvas.groups.keys()),
        "node_count": len(canvas.nodes),
        "message": "Retrieved canvas summary"
    }


# List of all canvas tools
CANVAS_TOOLS = [
    create_group,
    create_text_node,
    create_image_generation_node,
    create_video_generation_node,
    get_group_context_tool,
    get_canvas_summary_tool
]


# ========================================
# Helper Functions for Agents
# ========================================

def create_character_design_group(group_id: str, character_name: str) -> str:
    """Helper to create a group for character design"""
    result = create_group(
        label=f"Character: {character_name}",
        group_id=group_id
    )
    return result["group_id"]


def create_location_design_group(group_id: str, location_name: str) -> str:
    """Helper to create a group for location design"""
    result = create_group(
        label=f"Location: {location_name}",
        group_id=group_id
    )
    return result["group_id"]


def create_storyboard_group(group_id: str, scene_name: str, act_number: int) -> str:
    """Helper to create a group for storyboard"""
    result = create_group(
        label=f"Act {act_number} - {scene_name}",
        group_id=group_id
    )
    return result["group_id"]
