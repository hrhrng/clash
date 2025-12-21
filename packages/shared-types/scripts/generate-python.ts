/**
 * Generate Python dataclasses from Zod schemas
 * 
 * Output goes to packages/shared-types/python/ for true monorepo sharing.
 */

import * as fs from 'fs';
import * as path from 'path';

const PYTHON_OUTPUT_DIR = path.join(__dirname, '../python/clash_types');

// Ensure output directory exists
if (!fs.existsSync(PYTHON_OUTPUT_DIR)) {
  fs.mkdirSync(PYTHON_OUTPUT_DIR, { recursive: true });
}

// Generate Python code
const generatedPy = `"""
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
`;

fs.writeFileSync(path.join(PYTHON_OUTPUT_DIR, 'types.py'), generatedPy);
console.log(`Generated: ${path.join(PYTHON_OUTPUT_DIR, 'types.py')}`);

// Create __init__.py
const initPy = `"""
Clash Types - Auto-generated from @clash/shared-types Zod schemas.

Usage:
    from clash_types import CanvasNode, CanvasEdge, AIGCTask
"""

from clash_types.types import (
    NodeStatus,
    TaskType,
    TaskStatus,
    ExternalService,
    ActionType,
    Position,
    NodeData,
    CanvasNode,
    CanvasEdge,
    AIGCTask,
    SubmitTaskRequest,
    SubmitTaskResponse,
)

__all__ = [
    "NodeStatus",
    "TaskType",
    "TaskStatus",
    "ExternalService",
    "ActionType",
    "Position",
    "NodeData",
    "CanvasNode",
    "CanvasEdge",
    "AIGCTask",
    "SubmitTaskRequest",
    "SubmitTaskResponse",
]
`;

fs.writeFileSync(path.join(PYTHON_OUTPUT_DIR, '__init__.py'), initPy);
console.log(`Generated: ${path.join(PYTHON_OUTPUT_DIR, '__init__.py')}`);

console.log('\n✅ Python type generation complete');
console.log('Install with: pip install -e packages/shared-types/python');
