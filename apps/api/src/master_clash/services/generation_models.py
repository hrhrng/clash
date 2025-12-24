from __future__ import annotations

import asyncio
import base64
import logging
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Literal

import httpx

from master_clash.services import kling as beijing_kling
from master_clash.services import r2
from master_clash.services import kling_kie_client
from master_clash.tools.nano_banana import nano_banana_gen, nano_banana_pro_gen

logger = logging.getLogger(__name__)

DEFAULT_IMAGE_MODEL = "nano-banana-pro"
DEFAULT_VIDEO_MODEL = "kling-image2video"


# === Image generation ===
@dataclass
class ImageGenerationRequest:
    prompt: str
    model_id: str = DEFAULT_IMAGE_MODEL
    params: dict[str, Any] = field(default_factory=dict)
    reference_images: list[str] = field(default_factory=list)


@dataclass
class ImageGenerationResult:
    success: bool
    base64_data: str | None = None
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


async def _run_nano_banana(request: ImageGenerationRequest, *, use_pro: bool) -> ImageGenerationResult:
    generator = nano_banana_pro_gen if use_pro else nano_banana_gen
    aspect_ratio = request.params.get("aspect_ratio") or request.params.get("ratio") or "16:9"
    base64_refs = [ref.split(",")[-1] if "base64," in ref else ref for ref in request.reference_images]

    try:
        image_base64 = await asyncio.to_thread(
            generator,
            request.prompt,
            "",
            base64_refs,
            aspect_ratio,
        )
        return ImageGenerationResult(
            success=True,
            base64_data=image_base64,
            metadata={"model": request.model_id, "aspect_ratio": aspect_ratio},
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("[Generation] Nano Banana failed: %s", exc, exc_info=True)
        return ImageGenerationResult(success=False, error=str(exc))


async def generate_image(request: ImageGenerationRequest) -> ImageGenerationResult:
    model_id = request.model_id or DEFAULT_IMAGE_MODEL
    if model_id == "nano-banana":
        return await _run_nano_banana(request, use_pro=False)
    if model_id == "nano-banana-pro":
        return await _run_nano_banana(request, use_pro=True)

    return ImageGenerationResult(success=False, error=f"Unsupported image model: {model_id}")


# === Video generation ===
@dataclass
class VideoGenerationRequest:
    prompt: str
    project_id: str
    model_id: str = DEFAULT_VIDEO_MODEL
    params: dict[str, Any] = field(default_factory=dict)
    reference_images: list[str] = field(default_factory=list)
    callback_url: str | None = None


@dataclass
class VideoSubmissionResult:
    success: bool
    provider: str
    model_id: str
    external_task_id: str | None = None
    r2_key: str | None = None
    error: str | None = None


@dataclass
class VideoPollResult:
    status: Literal["pending", "completed", "failed"]
    r2_key: str | None = None
    error: str | None = None


VideoSubmitHandler = Callable[[VideoGenerationRequest], Awaitable[VideoSubmissionResult]]
VideoPollHandler = Callable[[str, str], Awaitable[VideoPollResult]]


def _coerce_duration(value: Any, *, default: int = 5) -> int:
    try:
        return int(value)
    except Exception:  # noqa: BLE001
        return default


async def _ensure_r2_keys(reference_images: list[str], project_id: str) -> list[str]:
    normalized: list[str] = []
    for idx, ref in enumerate(reference_images):
        if ref.startswith("http://") or ref.startswith("https://"):
            normalized.append(ref)
            continue
        if ref.startswith("data:"):
            try:
                encoded = ref.split(",", 1)[1]
                image_bytes = base64.b64decode(encoded)
                r2_key = f"projects/{project_id}/generated/ref_{int(time.time())}_{idx}.png"
                await r2.put_object(r2_key, image_bytes, "image/png")
                normalized.append(r2_key)
                continue
            except Exception as exc:  # noqa: BLE001
                logger.warning("[Generation] Failed to parse base64 reference: %s", exc)
        normalized.append(ref)
    return normalized


async def _submit_kling_image2video(request: VideoGenerationRequest) -> VideoSubmissionResult:
    normalized_refs = await _ensure_r2_keys(request.reference_images, request.project_id)
    image_r2_key = request.params.get("image_r2_key") or (normalized_refs[0] if normalized_refs else None)
    if not image_r2_key:
        return VideoSubmissionResult(
            success=False,
            provider="kling",
            model_id=request.model_id,
            error="image_r2_key is required for Kling image2video",
        )

    duration = _coerce_duration(request.params.get("duration", 5))
    model_name = request.params.get("model") or "kling-v1"

    submit_result = await beijing_kling.submit_video(
        prompt=request.prompt,
        image_r2_key=image_r2_key,
        duration=duration,
        model=model_name,
    )

    if not submit_result.get("success"):
        return VideoSubmissionResult(
            success=False,
            provider="kling",
            model_id=request.model_id,
            error=submit_result.get("error", "Kling submit failed"),
        )

    return VideoSubmissionResult(
        success=True,
        provider="kling",
        model_id=request.model_id,
        external_task_id=submit_result.get("external_task_id"),
    )


async def _poll_kling_image2video(external_task_id: str, project_id: str) -> VideoPollResult:
    poll_result = await beijing_kling.poll_video(external_task_id, project_id)
    status = poll_result.get("status")

    if status == "completed":
        return VideoPollResult(status="completed", r2_key=poll_result.get("r2_key"))
    if status == "failed":
        return VideoPollResult(status="failed", error=poll_result.get("error"))
    return VideoPollResult(status="pending")


def _public_r2_url(key: str) -> str:
    if key.startswith("http://") or key.startswith("https://"):
        return key
    base = r2.get_public_base_url().rstrip("/")
    return f"{base}/{key}"


async def _submit_kie_text2video(request: VideoGenerationRequest) -> VideoSubmissionResult:
    params = request.params
    try:
        task_id = await kling_kie_client.create_text_to_video_task(
            prompt=request.prompt,
            duration=str(params.get("duration", "5")),
            aspect_ratio=str(params.get("aspect_ratio", "16:9")),
            negative_prompt=str(params.get("negative_prompt", "blur, distort, low quality")),
            cfg_scale=float(params.get("cfg_scale", 0.5)),
            callback_url=request.callback_url,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("[Generation] KIE text2video error: %s", exc, exc_info=True)
        return VideoSubmissionResult(
            success=False,
            provider="kling-kie",
            model_id=request.model_id,
            error=str(exc),
        )

    return VideoSubmissionResult(
        success=True,
        provider="kling-kie",
        model_id=request.model_id,
        external_task_id=task_id,
    )


async def _submit_kie_image2video(request: VideoGenerationRequest) -> VideoSubmissionResult:
    normalized_refs = await _ensure_r2_keys(request.reference_images, request.project_id)
    reference = normalized_refs[0] if normalized_refs else None
    if not reference:
        return VideoSubmissionResult(
            success=False,
            provider="kling-kie",
            model_id=request.model_id,
            error="Reference image is required for Kling KIE image-to-video",
        )

    params = request.params
    image_url = _public_r2_url(reference)
    tail_image_url = params.get("tail_image_url")

    try:
        task_id = await kling_kie_client.create_image_to_video_task(
            image_url=image_url,
            prompt=request.prompt,
            duration=str(params.get("duration", "5")),
            aspect_ratio=str(params.get("aspect_ratio", "16:9")),
            negative_prompt=str(params.get("negative_prompt", "blur, distort, low quality")),
            cfg_scale=float(params.get("cfg_scale", 0.5)),
            tail_image_url=tail_image_url,
            callback_url=request.callback_url,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("[Generation] KIE image2video error: %s", exc, exc_info=True)
        return VideoSubmissionResult(
            success=False,
            provider="kling-kie",
            model_id=request.model_id,
            error=str(exc),
        )

    return VideoSubmissionResult(
        success=True,
        provider="kling-kie",
        model_id=request.model_id,
        external_task_id=task_id,
    )


async def _poll_kie_video(external_task_id: str, project_id: str) -> VideoPollResult:
    try:
        task_data = await kling_kie_client.query_task(external_task_id)
    except Exception as exc:  # noqa: BLE001
        return VideoPollResult(status="failed", error=str(exc))

    state = task_data.get("state")
    if state == "waiting":
        return VideoPollResult(status="pending")
    if state == "fail":
        return VideoPollResult(status="failed", error=task_data.get("failMsg", "KIE task failed"))

    result_json = task_data.get("resultJson") or {}
    urls: list[str] = []
    if isinstance(result_json, dict):
        urls = result_json.get("resultUrls") or result_json.get("resulturls") or []
    if not urls:
        return VideoPollResult(status="failed", error="No resultUrls returned by KIE")

    video_url = urls[0]
    async with httpx.AsyncClient(timeout=120.0) as client:
        video_resp = await client.get(video_url)
        if video_resp.status_code != 200:
            return VideoPollResult(
                status="failed",
                error=f"Download failed: HTTP {video_resp.status_code}",
            )
        r2_key = f"projects/{project_id}/generated/vid_{external_task_id}.mp4"
        await r2.put_object(r2_key, video_resp.content, "video/mp4")
        return VideoPollResult(status="completed", r2_key=r2_key)


VIDEO_SUBMIT_HANDLERS: dict[str, VideoSubmitHandler] = {
    "kling-image2video": _submit_kling_image2video,
    "kling-kie-text2video": _submit_kie_text2video,
    "kling-kie-image2video": _submit_kie_image2video,
}

VIDEO_POLL_HANDLERS: dict[str, VideoPollHandler] = {
    "kling-image2video": _poll_kling_image2video,
    "kling-kie-text2video": _poll_kie_video,
    "kling-kie-image2video": _poll_kie_video,
}


async def submit_video_job(request: VideoGenerationRequest) -> VideoSubmissionResult:
    model_id = request.model_id or DEFAULT_VIDEO_MODEL
    handler = VIDEO_SUBMIT_HANDLERS.get(model_id)
    if not handler:
        return VideoSubmissionResult(
            success=False,
            provider="unknown",
            model_id=model_id,
            error=f"Unsupported video model: {model_id}",
        )
    return await handler(request)


async def poll_video_job(model_id: str, external_task_id: str, project_id: str) -> VideoPollResult:
    handler = VIDEO_POLL_HANDLERS.get(model_id) or VIDEO_POLL_HANDLERS.get(DEFAULT_VIDEO_MODEL)
    if not handler:
        return VideoPollResult(status="failed", error=f"No poller for model {model_id}")
    return await handler(external_task_id, project_id)
