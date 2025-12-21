"""
Auto-generated type definitions from @clash/shared-types

DO NOT EDIT MANUALLY - Run 'pnpm --filter @clash/shared-types generate:python' to regenerate.
"""

from dataclasses import dataclass, field
from typing import Any, Literal


# === Enums ===

NodeStatus = Literal["idle", "pending", "generating", "completed", "failed"]
TaskType = Literal["kling_video", "nano_banana", "nano_banana_pro", "gemini_image"]
TaskStatus = Literal["pending", "generating", "completed", "failed"]
ExternalService = Literal["kling", "gemini", "vertex"]
ActionType = Literal["image-gen", "video-gen"]


# === Canvas Types ===

@dataclass
class Position:
    """Canvas position coordinates."""
    x: float
    y: float


@dataclass
class NodeData:
    """Node data payload."""
    label: str | None = None
    content: str | None = None
    description: str | None = None
    prompt: str | None = None
    src: str | None = None
    url: str | None = None
    thumbnail: str | None = None
    poster: str | None = None
    status: NodeStatus | None = None
    assetId: str | None = None
    taskId: str | None = None
    actionType: ActionType | None = None
    upstreamNodeIds: list[str] = field(default_factory=list)
    duration: float | None = None
    model: str | None = None
    referenceImageUrls: list[str] = field(default_factory=list)
    error: str | None = None
    sourceNodeId: str | None = None


@dataclass
class CanvasNode:
    """Canvas node (ReactFlow compatible)."""
    id: str
    type: str
    position: Position
    data: NodeData
    parentId: str | None = None
    extent: Literal["parent"] | None = None


@dataclass
class CanvasEdge:
    """Canvas edge (ReactFlow compatible)."""
    id: str
    source: str
    target: str
    type: str = "default"
    sourceHandle: str | None = None
    targetHandle: str | None = None


# === Task Types ===

@dataclass
class AIGCTask:
    """AIGC task stored in D1."""
    task_id: str
    project_id: str
    task_type: TaskType
    status: TaskStatus
    params: str  # JSON string
    created_at: int
    updated_at: int
    retry_count: int
    max_retries: int
    external_task_id: str | None = None
    external_service: ExternalService | None = None
    result_url: str | None = None
    result_data: str | None = None  # JSON string
    error_message: str | None = None
    completed_at: int | None = None


@dataclass
class SubmitTaskRequest:
    """Task submission payload."""
    project_id: str
    task_type: TaskType
    params: dict[str, Any]


@dataclass
class SubmitTaskResponse:
    """Task submission response."""
    task_id: str
    status: TaskStatus
    created_at: int
