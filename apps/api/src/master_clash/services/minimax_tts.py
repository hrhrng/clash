"""
MiniMax TTS Client

High-quality text-to-speech API integration for Chinese and English.
Reference: https://www.minimaxi.com/document/guides/text-to-speech
"""

import asyncio
import base64
import logging
from dataclasses import dataclass

import httpx

from master_clash.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class TTSRequest:
    """Request for text-to-speech generation."""
    text: str
    voice_id: str = "female-warm"
    speed: float = 1.0
    pitch: int = 0
    model: str = "speech-01"


@dataclass
class TTSResult:
    """Result from text-to-speech generation."""
    success: bool
    audio_base64: str | None = None
    error: str | None = None
    metadata: dict | None = None


# MiniMax voice ID mapping
VOICE_ID_MAP = {
    "female-warm": "female-warm",
    "female-energetic": "female-energetic",
    "male-calm": "male-calm",
    "male-storyteller": "male-storyteller",
}


async def generate_speech(request: TTSRequest) -> TTSResult:
    """
    Generate speech from text using MiniMax TTS API.

    Args:
        request: TTS generation request

    Returns:
        TTSResult with audio data or error
    """
    if not settings.minimax_api_key:
        return TTSResult(
            success=False,
            error="MiniMax API key not configured. Set MINIMAX_API_KEY environment variable."
        )

    voice_id = VOICE_ID_MAP.get(request.voice_id, "female-warm")

    logger.info(f"[MiniMax TTS] Generating speech: text_length={len(request.text)}, voice={voice_id}, speed={request.speed}")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.minimax.chat/v1/text_to_speech",
                headers={
                    "Authorization": f"Bearer {settings.minimax_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": request.model,
                    "text": request.text,
                    "voice_id": voice_id,
                    "speed": request.speed,
                    "pitch": request.pitch,
                    "audio_format": "mp3",
                }
            )

            if response.status_code != 200:
                error_msg = f"MiniMax API error: {response.status_code} - {response.text}"
                logger.error(f"[MiniMax TTS] {error_msg}")
                return TTSResult(success=False, error=error_msg)

            result = response.json()

            # MiniMax returns base64-encoded audio data
            audio_base64 = result.get("audio_data")
            if not audio_base64:
                return TTSResult(success=False, error="No audio data in response")

            logger.info(f"[MiniMax TTS] ✅ Speech generated successfully, audio size: {len(audio_base64)} bytes")

            return TTSResult(
                success=True,
                audio_base64=audio_base64,
                metadata={
                    "provider": "minimax",
                    "voice_id": voice_id,
                    "duration": result.get("duration"),
                }
            )

    except Exception as exc:
        logger.error(f"[MiniMax TTS] ❌ Generation failed: {exc}", exc_info=True)
        return TTSResult(success=False, error=str(exc))
