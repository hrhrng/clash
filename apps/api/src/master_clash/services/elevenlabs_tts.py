"""
ElevenLabs TTS Client

Ultra-realistic voice synthesis with emotional range.
Reference: https://elevenlabs.io/docs/api-reference/text-to-speech
"""

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
    voice_id: str = "rachel"
    model_id: str = "eleven_multilingual_v2"
    stability: float = 0.5
    similarity_boost: float = 0.75


@dataclass
class TTSResult:
    """Result from text-to-speech generation."""
    success: bool
    audio_bytes: bytes | None = None
    error: str | None = None
    metadata: dict | None = None


# ElevenLabs voice ID mapping (using actual ElevenLabs voice IDs)
VOICE_ID_MAP = {
    "rachel": "21m00Tcm4TlvDq8ikWAM",  # Rachel
    "drew": "29vD33N1CtxCmqQRPOHJ",    # Drew
    "clyde": "2EiwWnXFnvU5JabPnv8n",   # Clyde
    "paul": "5Q0t7uMcjvnagumLfvZi",    # Paul
}


async def generate_speech(request: TTSRequest) -> TTSResult:
    """
    Generate speech from text using ElevenLabs TTS API.

    Args:
        request: TTS generation request

    Returns:
        TTSResult with audio data or error
    """
    if not settings.elevenlabs_api_key:
        return TTSResult(
            success=False,
            error="ElevenLabs API key not configured. Set ELEVENLABS_API_KEY environment variable."
        )

    voice_id = VOICE_ID_MAP.get(request.voice_id, VOICE_ID_MAP["rachel"])

    logger.info(
        f"[ElevenLabs TTS] Generating speech: text_length={len(request.text)}, "
        f"voice={request.voice_id}, model={request.model_id}"
    )

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                headers={
                    "xi-api-key": settings.elevenlabs_api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": request.text,
                    "model_id": request.model_id,
                    "voice_settings": {
                        "stability": request.stability,
                        "similarity_boost": request.similarity_boost,
                    }
                }
            )

            if response.status_code != 200:
                error_msg = f"ElevenLabs API error: {response.status_code} - {response.text}"
                logger.error(f"[ElevenLabs TTS] {error_msg}")
                return TTSResult(success=False, error=error_msg)

            # ElevenLabs returns raw audio bytes (MP3 format)
            audio_bytes = response.content

            logger.info(f"[ElevenLabs TTS] ✅ Speech generated successfully, audio size: {len(audio_bytes)} bytes")

            return TTSResult(
                success=True,
                audio_bytes=audio_bytes,
                metadata={
                    "provider": "elevenlabs",
                    "voice_id": request.voice_id,
                    "model_id": request.model_id,
                }
            )

    except Exception as exc:
        logger.error(f"[ElevenLabs TTS] ❌ Generation failed: {exc}", exc_info=True)
        return TTSResult(success=False, error=str(exc))
