"""Shared types and schemas for the workflow.

This module contains Pydantic models and type definitions shared across
middleware, agents, and tools.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field


# Video Editor DSL Schema
class VideoTrackItem(BaseModel):
    """An item (clip) in a video track."""
    id: str = Field(description="Unique identifier for the clip")
    type: Literal["video", "image", "text", "audio"] = Field(
        default="video",
        description="Type of the clip item"
    )
    asset_id: str | None = Field(
        default=None,
        alias="assetId",
        description="ID of the asset node (for video/image/audio)"
    )
    from_: int = Field(
        alias="from",
        default=0,
        description="Start frame in the timeline"
    )
    duration_in_frames: int = Field(
        default=0,
        alias="durationInFrames",
        description="Duration of the clip in frames"
    )
    start_at: int = Field(
        default=0,
        alias="startAt",
        description="Start frame within the source asset (trim start)"
    )
    # Style/Transform properties
    style: dict[str, Any] | None = Field(
        default=None,
        description="CSS-like style properties (width, height, etc)"
    )

    class Config:
        populate_by_name = True


class VideoTrack(BaseModel):
    """A track containing video items."""
    id: str = Field(description="Unique identifier for the track")
    items: list[VideoTrackItem] = Field(
        default_factory=list,
        description="List of clips/items in this track"
    )
    # Optional metadata
    name: str | None = Field(default=None, description="Track name")
    type: str = Field(default="main", description="Track type (main, overlay, audio)")

    class Config:
        populate_by_name = True


class TimelineDSL(BaseModel):
    """Root structure for the video editor DSL."""
    version: str = Field(default="1.0.0", description="DSL version")
    fps: int = Field(default=30, description="Frames per second")
    composition_width: int = Field(
        default=1920,
        alias="compositionWidth",
        description="Canvas width"
    )
    composition_height: int = Field(
        default=1080,
        alias="compositionHeight",
        description="Canvas height"
    )
    duration_in_frames: int = Field(
        default=0,
        alias="durationInFrames",
        description="Total duration (usually calculated from max end frame)"
    )
    tracks: list[VideoTrack] = Field(
        default_factory=list,
        description="List of tracks in the timeline"
    )

    class Config:
        extra = "allow"
        populate_by_name = True
