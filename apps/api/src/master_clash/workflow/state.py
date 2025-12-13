"""State definitions for LangGraph workflows.

Defines the state schema for video production workflows,
tracking screenplay, assets, shots, and metadata.
"""

from typing import Annotated, TypedDict

from langgraph.graph import add_messages

from master_clash.models import Screenplay


class CharacterDesignDict(TypedDict, total=False):
    """Character design information."""

    character_name: str
    image_paths: list[str]
    image_urls: list[str]
    generation_params: dict


class LocationDesignDict(TypedDict, total=False):
    """Location design information."""

    location_name: str
    image_paths: list[str]
    image_urls: list[str]
    generation_params: dict


class ProductionDesignDict(TypedDict, total=False):
    """Production design containing all visual assets."""

    character_designs: list[CharacterDesignDict]
    location_designs: list[LocationDesignDict]


class ShotDict(TypedDict, total=False):
    """Individual shot information."""

    shot_id: str
    scene_number: int
    description: str
    keyframe_path: str | None
    video_path: str | None
    video_url: str | None
    duration: float | None
    generation_params: dict


class VideoProductionState(TypedDict, total=False):
    """State for video production workflow.

    This state is passed through all nodes in the workflow graph.
    Each field can be updated by different nodes.
    """

    # Input
    story_input: str  # Original story idea or CSV data
    story_csv_path: str | None  # Path to story CSV file

    # Screenplay generation output
    screenplay: Screenplay | None
    screenplay_error: str | None

    # Art direction output
    production_design: ProductionDesignDict | None
    art_direction_error: str | None

    # Shot generation output
    shots: list[ShotDict]
    shot_generation_error: str | None

    # Final output
    final_video_path: str | None
    final_video_url: str | None

    # Metadata and tracking
    run_id: str
    current_step: str
    total_cost: float
    total_duration_ms: int
    api_call_count: int
    errors: list[str]

    # Messages for LangChain integration
    messages: Annotated[list, add_messages]

    # Status
    status: str  # "running", "completed", "failed", "paused"
