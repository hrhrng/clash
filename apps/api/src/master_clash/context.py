import logging
import os
from typing import Any
from urllib.parse import urljoin

import requests
from pydantic import BaseModel

from master_clash.config import get_settings


class NodeModel(BaseModel):
    id: str
    type: str
    data: dict[str, Any]
    position: dict[str, float]
    parentId: str | None = None  # noqa: N815

class EdgeModel(BaseModel):
    id: str
    source: str
    target: str
    type: str | None = None

class ProjectContext(BaseModel):
    nodes: list[NodeModel]
    edges: list[EdgeModel]

# In-memory store for project context
_PROJECT_CONTEXTS: dict[str, ProjectContext] = {}

logger = logging.getLogger(__name__)

_frontend_base_env = os.getenv("FRONTEND_API_BASE_URL")
_context_path = os.getenv("FRONTEND_CONTEXT_ENDPOINT", "/api/internal/projects/{project_id}/context")


def _frontend_base_url() -> str:
    """Resolve frontend base URL from env or settings (lazy)."""
    if _frontend_base_env:
        return _frontend_base_env
    try:
        settings = get_settings()
        value = getattr(settings, "frontend_api_base_url", None)
        if value:
            return value
    except Exception:
        logger.debug("Failed to load settings for frontend base url; using default localhost.")
    return "http://localhost:3000"


def _build_frontend_url(project_id: str) -> str:
    base = _frontend_base_url()
    return urljoin(base.rstrip("/") + "/", _context_path.format(project_id=project_id).lstrip("/"))


def fetch_project_context(project_id: str) -> ProjectContext | None:
    """
    Fetch project context from the frontend service.

    Falls back to the in-memory cache if the HTTP call fails.
    """
    url = _build_frontend_url(project_id)
    try:
        resp = requests.get(url, timeout=50)
        resp.raise_for_status()
        payload = resp.json()
        context = ProjectContext(**payload)
        _PROJECT_CONTEXTS[project_id] = context
        logger.info("Fetched context from frontend: %s, %s", project_id, context)
        return context
    except Exception as exc:
        logger.warning("Failed to fetch context from frontend %s: %s. Falling back to cache.", url, exc)
        return _PROJECT_CONTEXTS.get(project_id)


def get_project_context(project_id: str, force_refresh: bool = False) -> ProjectContext | None:
    """
    Retrieve project context, preferring the frontend API over in-memory cache.

    Args:
        project_id: Project identifier.
        force_refresh: If True, always attempt a frontend fetch.
    """
    if force_refresh:
        return fetch_project_context(project_id)
    # Try cached first to reduce traffic, then fetch if missing
    cached = _PROJECT_CONTEXTS.get(project_id)
    if cached:
        return cached
    return fetch_project_context(project_id)

def set_project_context(project_id: str, context: ProjectContext):
    _PROJECT_CONTEXTS[project_id] = context

def find_node_by_id(node_id: str, project_context: ProjectContext) -> NodeModel | None:
    if not project_context:
        return None
    for node in project_context.nodes:
        if node.id == node_id:
            return node
    return None

def get_asset_id(node_id: str, project_context: ProjectContext) -> str | None:
    node = find_node_by_id(node_id, project_context)
    if node and node.data:
        return node.data.get("assetId")
    return None

def get_status(node_id: str, project_context: ProjectContext) -> str | None:
    node = find_node_by_id(node_id, project_context)
    if node and node.data:
        return node.data.get("status")
    return None
