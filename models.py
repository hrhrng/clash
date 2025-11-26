"""
Data models for video production system.
Contains Pydantic models for script structure, assets, and shots.
"""

from typing import List, Optional
from pydantic import BaseModel, Field


class Camera(BaseModel):
    """Camera specification for a shot."""
    shot_size: str = Field(description="e.g., 'Medium Shot', 'Close-up'")
    angle: str = Field(description="e.g., 'Eye-level', 'High angle'")
    movement: str = Field(description="e.g., 'Tracking', 'Static', 'Pan'")


class VisualSpec(BaseModel):
    """Visual specifications for a shot."""
    camera: Camera
    blocking: str = Field(description="Spatial layout and positioning")
    lighting_atmosphere: str = Field(description="Lighting and mood description")


class Performance(BaseModel):
    """Performance specifications for actors in a shot."""
    emotional_context: str = Field(description="Internal feeling, e.g., 'Curiosity mixed with fear'")
    visible_acting: str = Field(description="External action, e.g., 'Slowly reaching out hand'")


class Audio(BaseModel):
    """Audio specifications for a shot."""
    dialogue: str = Field(default="", description="Spoken dialogue")
    sfx: str = Field(default="", description="Sound effects")


class Shot(BaseModel):
    """Individual shot in the sequence."""
    shot_id: int = Field(description="Shot number/ID")
    scene_id: str = Field(description="Reference to location ID")
    char_ids: List[str] = Field(default_factory=list, description="List of character IDs in this shot")
    duration_sec: int = Field(description="Duration in seconds")
    narrative_beat: str = Field(description="Which part of the story outline")
    visual_spec: VisualSpec
    performance: Performance
    audio: Audio


class Character(BaseModel):
    """Character definition with visual anchor."""
    id: str = Field(description="Unique character ID, e.g., 'char_1'")
    name: str
    visual_anchor: str = Field(description="Fixed visual features for consistency")


class Location(BaseModel):
    """Location definition with environment anchor."""
    id: str = Field(description="Unique location ID, e.g., 'loc_1'")
    name: str
    environment_anchor: str = Field(description="Fixed environment details for consistency")


class Concept(BaseModel):
    """Overall concept and aesthetic for the production."""
    story_outline: str = Field(description="Colloquial summary of the entire plot")
    genre: str
    global_aesthetic: str = Field(description="Art style, lighting, and mood keywords")


class Assets(BaseModel):
    """Collection of production assets."""
    characters: List[Character]
    locations: List[Location]


class ScriptOutput(BaseModel):
    """Complete script output with all production details."""
    step_1_concept: Concept
    step_2_assets: Assets
    step_3_sequence: List[Shot]
