"""
KIE.ai ElevenLabs TTS Client

Alternative provider for ElevenLabs TTS through KIE.ai API.
Reference: https://kie.ai API documentation (Sound Effect V2)
"""

import asyncio
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


# Voice ID mapping - KIE.ai uses same voice IDs as ElevenLabs
VOICE_ID_MAP = {
    "rachel": "21m00Tcm4TlvDq8ikWAM",
    "drew": "29vD33N1CtxCmqQRPOHJ",
    "clyde": "2EiwWnXFnvU5JabPnv8n",
    "paul": "5Q0t7uMcjvnagumLfvZi",
}


async def generate_speech(request: TTSRequest) -> TTSResult:
    """
    Generate speech from text using KIE.ai ElevenLabs Sound Effect V2 API.

    Args:
        request: TTS generation request

    Returns:
        TTSResult with audio data or error
    """
    if not settings.kie_api_key:
        return TTSResult(
            success=False,
            error="KIE API key not configured. Set KIE_API_KEY environment variable."
        )

    voice_id = VOICE_ID_MAP.get(request.voice_id, VOICE_ID_MAP["rachel"])

    logger.info(
        f"[KIE ElevenLabs TTS] Generating speech: text_length={len(request.text)}, "
        f"voice={request.voice_id}, model={request.model_id}"
    )

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            # Step 1: Create task
            create_response = await client.post(
                "https://api.kie.ai/api/v1/jobs/createTask",
                headers={
                    "Authorization": f"Bearer {settings.kie_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "elevenlabs/sound-effect-v2",
                    "task_type": "text-to-speech",
                    "input": {
                        "text": request.text,
                        "voice_id": voice_id,
                        "model_id": request.model_id,
                        "voice_settings": {
                            "stability": request.stability,
                            "similarity_boost": request.similarity_boost,
                        }
                    }
                }
            )

            if create_response.status_code != 200:
                error_msg = f"KIE API create task error: {create_response.status_code} - {create_response.text}"
                logger.error(f"[KIE ElevenLabs TTS] {error_msg}")
                return TTSResult(success=False, error=error_msg)

            create_result = create_response.json()
            task_id = create_result.get("task_id")

            if not task_id:
                return TTSResult(success=False, error="No task_id in create response")

            logger.info(f"[KIE ElevenLabs TTS] Task created: {task_id}, polling for completion...")

            # Step 2: Poll for completion
            max_attempts = 60  # 60 attempts * 3 seconds = 3 minutes max
            attempt = 0

            while attempt < max_attempts:
                await asyncio.sleep(3)  # Poll every 3 seconds
                attempt += 1

                status_response = await client.get(
                    f"https://api.kie.ai/api/v1/jobs/recordInfo?taskId={task_id}",
                    headers={
                        "Authorization": f"Bearer {settings.kie_api_key}",
                    }
                )

                if status_response.status_code != 200:
                    logger.warning(
                        f"[KIE ElevenLabs TTS] Status check failed: {status_response.status_code}"
                    )
                    continue

                status_result = status_response.json()
                task_status = status_result.get("status")

                logger.info(f"[KIE ElevenLabs TTS] Attempt {attempt}/{max_attempts}: status={task_status}")

                if task_status == "succeeded":
                    # Task completed successfully
                    output = status_result.get("output", {})
                    audio_url = output.get("audio_url")

                    if not audio_url:
                        return TTSResult(success=False, error="No audio_url in success response")

                    # Download the audio file
                    audio_response = await client.get(audio_url)
                    if audio_response.status_code != 200:
                        return TTSResult(
                            success=False,
                            error=f"Failed to download audio: {audio_response.status_code}"
                        )

                    audio_bytes = audio_response.content

                    logger.info(
                        f"[KIE ElevenLabs TTS] ✅ Speech generated successfully, "
                        f"audio size: {len(audio_bytes)} bytes"
                    )

                    return TTSResult(
                        success=True,
                        audio_bytes=audio_bytes,
                        metadata={
                            "provider": "kie-elevenlabs",
                            "voice_id": request.voice_id,
                            "model_id": request.model_id,
                            "task_id": task_id,
                        }
                    )

                elif task_status == "failed":
                    error_msg = status_result.get("error", "Unknown error")
                    logger.error(f"[KIE ElevenLabs TTS] Task failed: {error_msg}")
                    return TTSResult(success=False, error=f"Task failed: {error_msg}")

                elif task_status in ["pending", "processing"]:
                    # Continue polling
                    continue

                else:
                    logger.warning(f"[KIE ElevenLabs TTS] Unknown status: {task_status}")

            # Timeout
            return TTSResult(
                success=False,
                error=f"Task polling timeout after {max_attempts * 3} seconds"
            )

    except Exception as exc:
        logger.error(f"[KIE ElevenLabs TTS] ❌ Generation failed: {exc}", exc_info=True)
        return TTSResult(success=False, error=str(exc))
