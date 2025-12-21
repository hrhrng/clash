"""
List Nodes Tool

Provides the list_canvas_nodes tool for listing nodes on the canvas.
"""

import logging
from collections import defaultdict
from typing import Literal

from langchain.tools import BaseTool, ToolRuntime
from pydantic import BaseModel, Field

from master_clash.workflow.backends import CanvasBackendProtocol, NodeInfo

logger = logging.getLogger(__name__)


def create_list_nodes_tool(backend: CanvasBackendProtocol) -> BaseTool:
    """Create list_canvas_nodes tool."""
    from langchain_core.tools import tool

    class ListCanvasNodesInput(BaseModel):
        node_type: Literal["text", "prompt", "group", "image", "video"] | None = Field(
            default=None, description="Optional filter by node type"
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

            return lines, has_match

        root_parent = parent_id or None
        tree_lines, has_any = render_tree(root_parent, "")

        if not has_any:
            return "No nodes found."

        header = "Canvas nodes (tree):"
        return "\n".join([header, *tree_lines])

    return list_canvas_nodes
