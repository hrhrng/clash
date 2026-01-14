"""
List Model Cards Tool

Provides a tool to list available model cards for a given asset kind.
"""

from dataclasses import asdict
from typing import Literal

from langchain.tools import BaseTool
from pydantic import BaseModel, Field

from clash_types.types import MODEL_CARDS


def create_list_model_cards_tool() -> BaseTool:
    """Create list_model_cards tool."""
    from langchain_core.tools import tool

    class ListModelCardsInput(BaseModel):
        kind: Literal[
            "image",
            "video",
            "audio",
            "image_gen",
            "video_gen",
            "audio_gen",
        ] | None = Field(
            default=None,
            description=(
                "Optional asset kind to filter models. Accepts image/video/audio "
                "or image_gen/video_gen/audio_gen."
            ),
        )

    @tool(args_schema=ListModelCardsInput)
    def list_model_cards(kind: str | None = None) -> list[dict]:
        """List available model cards, optionally filtered by asset kind."""
        normalized_kind = None
        if kind:
            normalized_kind = kind.replace("_gen", "")

        cards = MODEL_CARDS
        if normalized_kind:
            cards = [card for card in MODEL_CARDS if card.kind == normalized_kind]

        return [asdict(card) for card in cards]

    return list_model_cards
