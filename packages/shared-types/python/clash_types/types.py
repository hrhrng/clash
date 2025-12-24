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
ModelKind = Literal["image", "video"]
ModelParameterType = Literal["select", "slider", "number", "text", "boolean"]
ReferenceMode = Literal["none", "single", "multi", "start_end"]


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
    modelId: str | None = None
    modelParams: dict[str, Any] | None = None
    referenceMode: ReferenceMode | None = None
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


# === Model Cards ===

@dataclass
class ModelParameter:
    id: str
    label: str
    type: ModelParameterType
    description: str | None = None
    required: bool = False
    options: list[dict[str, Any]] | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    placeholder: str | None = None
    defaultValue: str | float | bool | None = None


@dataclass
class ModelInputRule:
    requiresPrompt: bool = True
    referenceImage: Literal["required", "optional", "forbidden"] = "optional"
    referenceMode: ReferenceMode = "single"


@dataclass
class ModelCard:
    id: str
    name: str
    provider: str
    kind: ModelKind
    description: str | None = None
    parameters: list[ModelParameter] = field(default_factory=list)
    defaultParams: dict[str, Any] = field(default_factory=dict)
    input: ModelInputRule = field(default_factory=ModelInputRule)


MODEL_CARDS: list[ModelCard] = [
    ModelCard(
        id="nano-banana",
        name="Nano Banana",
        provider="Google Gemini",
        kind="image",
        description="Gemini 2.5 Flash image generation tuned for fast drafts.",
        parameters=[
            ModelParameter(
                id="aspect_ratio",
                label="Aspect Ratio",
                type="select",
                options=[
                    {"label": "1:1", "value": "1:1"},
                    {"label": "3:4", "value": "3:4"},
                    {"label": "4:3", "value": "4:3"},
                    {"label": "9:16", "value": "9:16"},
                    {"label": "16:9", "value": "16:9"},
                ],
                defaultValue="16:9",
            ),
            ModelParameter(
                id="stylization",
                label="Stylization",
                type="slider",
                min=0,
                max=1000,
                step=10,
                defaultValue=100,
                description="Higher values add more model-driven styling.",
            ),
            ModelParameter(
                id="weirdness",
                label="Weirdness",
                type="slider",
                min=0,
                max=1000,
                step=10,
                defaultValue=0,
                description="Experimentation strength for unexpected details.",
            ),
            ModelParameter(
                id="diversity",
                label="Diversity",
                type="slider",
                min=0,
                max=1000,
                step=10,
                defaultValue=0,
                description="Encourage variety across multiple renders.",
            ),
            ModelParameter(
                id="count",
                label="Count",
                type="number",
                min=1,
                max=8,
                step=1,
                defaultValue=1,
                description="How many candidates to request in one call.",
            ),
        ],
        defaultParams={
            "aspect_ratio": "16:9",
            "stylization": 100,
            "weirdness": 0,
            "diversity": 0,
            "count": 1,
        },
        input=ModelInputRule(requiresPrompt=True, referenceImage="optional", referenceMode="single"),
    ),
    ModelCard(
        id="nano-banana-pro",
        name="Nano Banana Pro",
        provider="Google Gemini",
        kind="image",
        description="Gemini 3.0 Pro Image Preview for higher fidelity generations.",
        parameters=[
            ModelParameter(
                id="aspect_ratio",
                label="Aspect Ratio",
                type="select",
                options=[
                    {"label": "1:1", "value": "1:1"},
                    {"label": "3:4", "value": "3:4"},
                    {"label": "4:3", "value": "4:3"},
                    {"label": "9:16", "value": "9:16"},
                    {"label": "16:9", "value": "16:9"},
                ],
                defaultValue="16:9",
            ),
            ModelParameter(
                id="stylization",
                label="Stylization",
                type="slider",
                min=0,
                max=1000,
                step=10,
                defaultValue=200,
            ),
            ModelParameter(
                id="weirdness",
                label="Weirdness",
                type="slider",
                min=0,
                max=1000,
                step=10,
                defaultValue=0,
            ),
            ModelParameter(
                id="count",
                label="Count",
                type="number",
                min=1,
                max=8,
                step=1,
                defaultValue=1,
                description="How many candidates to request in one call.",
            ),
        ],
        defaultParams={
            "aspect_ratio": "16:9",
            "stylization": 200,
            "weirdness": 0,
            "count": 1,
        },
        input=ModelInputRule(requiresPrompt=True, referenceImage="optional", referenceMode="single"),
    ),
    ModelCard(
        id="kling-image2video",
        name="Kling Image2Video",
        provider="Kling (Beijing)",
        kind="video",
        description="Turn a single keyframe into a short cinematic clip.",
        parameters=[
            ModelParameter(
                id="duration",
                label="Duration",
                type="select",
                options=[
                    {"label": "5s", "value": 5},
                    {"label": "10s", "value": 10},
                ],
                defaultValue=5,
            ),
            ModelParameter(
                id="cfg_scale",
                label="CFG",
                type="slider",
                min=0,
                max=1,
                step=0.05,
                defaultValue=0.5,
                description="Higher values adhere more tightly to the prompt.",
            ),
        ],
        defaultParams={
            "duration": 5,
            "cfg_scale": 0.5,
        },
        input=ModelInputRule(requiresPrompt=True, referenceImage="required", referenceMode="single"),
    ),
    ModelCard(
        id="kling-kie-text2video",
        name="Kling Text2Video Pro",
        provider="Kling AI (KIE)",
        kind="video",
        description="Direct text-to-video generation via Kling KIE API.",
        parameters=[
            ModelParameter(
                id="duration",
                label="Duration",
                type="select",
                options=[
                    {"label": "5s", "value": "5"},
                    {"label": "10s", "value": "10"},
                ],
                defaultValue="5",
            ),
            ModelParameter(
                id="aspect_ratio",
                label="Aspect Ratio",
                type="select",
                options=[
                    {"label": "16:9", "value": "16:9"},
                    {"label": "9:16", "value": "9:16"},
                    {"label": "1:1", "value": "1:1"},
                ],
                defaultValue="16:9",
            ),
            ModelParameter(
                id="negative_prompt",
                label="Negative Prompt",
                type="text",
                placeholder="blur, distort, low quality",
                defaultValue="blur, distort, low quality",
            ),
            ModelParameter(
                id="cfg_scale",
                label="CFG",
                type="slider",
                min=0,
                max=1,
                step=0.05,
                defaultValue=0.5,
            ),
        ],
        defaultParams={
            "duration": "5",
            "aspect_ratio": "16:9",
            "negative_prompt": "blur, distort, low quality",
            "cfg_scale": 0.5,
        },
        input=ModelInputRule(requiresPrompt=True, referenceImage="forbidden", referenceMode="none"),
    ),
    ModelCard(
        id="kling-kie-image2video",
        name="Kling Image2Video Pro",
        provider="Kling AI (KIE)",
        kind="video",
        description="Animate a still image with Kling KIE image-to-video.",
        parameters=[
            ModelParameter(
                id="duration",
                label="Duration",
                type="select",
                options=[
                    {"label": "5s", "value": "5"},
                    {"label": "10s", "value": "10"},
                ],
                defaultValue="5",
            ),
            ModelParameter(
                id="aspect_ratio",
                label="Aspect Ratio",
                type="select",
                options=[
                    {"label": "16:9", "value": "16:9"},
                    {"label": "9:16", "value": "9:16"},
                    {"label": "1:1", "value": "1:1"},
                ],
                defaultValue="16:9",
            ),
            ModelParameter(
                id="negative_prompt",
                label="Negative Prompt",
                type="text",
                placeholder="blur, distort, low quality",
                defaultValue="blur, distort, low quality",
            ),
            ModelParameter(
                id="cfg_scale",
                label="CFG",
                type="slider",
                min=0,
                max=1,
                step=0.05,
                defaultValue=0.5,
            ),
        ],
        defaultParams={
            "duration": "5",
            "aspect_ratio": "16:9",
            "negative_prompt": "blur, distort, low quality",
            "cfg_scale": 0.5,
        },
        input=ModelInputRule(requiresPrompt=True, referenceImage="required", referenceMode="start_end"),
    ),
]
