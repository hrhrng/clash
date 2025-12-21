"""
Search Nodes Tool

Provides the search_canvas tool for searching nodes by content.
"""

import logging

from langchain.tools import BaseTool, ToolRuntime
from pydantic import BaseModel, Field

from master_clash.workflow.backends import CanvasBackendProtocol

logger = logging.getLogger(__name__)


def create_search_nodes_tool(backend: CanvasBackendProtocol) -> BaseTool:
    """Create search_canvas tool."""
    from langchain_core.tools import tool

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
