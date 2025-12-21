"""
Unified Task Executor API Router.

Single endpoint for atomic task execution:
- POST /api/tasks/execute - Execute atomic task synchronously

Task types:
- image_gen: Generate image with Gemini
- video_gen: Submit video to Kling (returns external_task_id)
- description: Generate description for asset
"""

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from master_clash.services import r2, genai, kling

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


# === Request/Response Models ===

class ImageGenParams(BaseModel):
    """Image generation parameters."""
    prompt: str = Field(..., description="Image prompt")
    model: str = Field(default="gemini-2.0-flash-preview-image-generation")
    aspect_ratio: str | None = None


class VideoGenParams(BaseModel):
    """Video generation parameters."""
    prompt: str = Field(..., description="Video prompt")
    image_r2_key: str = Field(..., description="Source image R2 key")
    duration: int = Field(default=5)
    model: str = Field(default="kling-v1")
    project_id: str = Field(default="unknown", description="Project ID for R2 upload")


class DescriptionParams(BaseModel):
    """Description generation parameters."""
    r2_key: str = Field(..., description="Asset R2 key")
    mime_type: str = Field(..., description="Asset MIME type")


class ExecuteRequest(BaseModel):
    """Unified task execution request."""
    task_type: Literal["image_gen", "video_gen", "description"]
    params: dict


class ExecuteResponse(BaseModel):
    """Unified task execution response."""
    success: bool
    r2_key: str | None = None
    external_task_id: str | None = None  # For async tasks (Kling)
    data: dict | None = None
    error: str | None = None


# === Endpoints ===

@router.post("/execute", response_model=ExecuteResponse)
async def execute_task(request: ExecuteRequest) -> ExecuteResponse:
    """
    Execute an atomic task synchronously.
    
    No retry logic - that's handled by the DO.
    """
    logger.info(f"[Execute] {request.task_type}")
    
    try:
        if request.task_type == "image_gen":
            return await _execute_image_gen(request.params)
            
        elif request.task_type == "video_gen":
            return await _execute_video_gen(request.params)
            
        elif request.task_type == "description":
            return await _execute_description(request.params)
            
        else:
            return ExecuteResponse(success=False, error=f"Unknown task type: {request.task_type}")
            
    except Exception as e:
        logger.error(f"[Execute] Error: {e}")
        return ExecuteResponse(success=False, error=str(e))


async def _execute_image_gen(params: dict) -> ExecuteResponse:
    """Generate image using Gemini (via nano_banana)."""
    import asyncio
    import base64
    import uuid
    from master_clash.tools.nano_banana import nano_banana_gen
    
    validated = ImageGenParams(**params)
    
    logger.info(f"[Execute] Generating image: {validated.prompt[:50]}...")
    
    try:
        # Run synchronous nano_banana_gen in thread
        base64_image = await asyncio.to_thread(
            nano_banana_gen,
            text=validated.prompt,
            aspect_ratio=validated.aspect_ratio or "16:9",
        )
        
        if not base64_image:
            return ExecuteResponse(success=False, error="Image generation returned empty")
        
        # Strip data URL prefix if present
        if "base64," in base64_image:
            base64_image = base64_image.split("base64,", 1)[1]
        
        # Decode and upload to R2
        image_data = base64.b64decode(base64_image)
        
        # Generate R2 key
        project_id = params.get("project_id", "unknown")
        r2_key = f"projects/{project_id}/generated/img_{uuid.uuid4().hex[:12]}.png"
        
        logger.info(f"[Execute] Uploading image to R2: {r2_key}")
        await r2.put_object(r2_key, image_data, "image/png")
        
        return ExecuteResponse(success=True, r2_key=r2_key)
        
    except Exception as e:
        logger.error(f"[Execute] Image generation failed: {e}")
        return ExecuteResponse(success=False, error=str(e))


async def _execute_video_gen(params: dict) -> ExecuteResponse:
    """Submit video to Kling."""
    validated = VideoGenParams(**params)
    
    result = await kling.submit_video(
        prompt=validated.prompt,
        image_r2_key=validated.image_r2_key,
        duration=validated.duration,
        model=validated.model,
    )
    
    if result.get("success"):
        return ExecuteResponse(
            success=True,
            external_task_id=result.get("external_task_id"),
        )
    else:
        return ExecuteResponse(
            success=False,
            error=result.get("error"),
        )


async def _execute_description(params: dict) -> ExecuteResponse:
    """Generate description for asset."""
    validated = DescriptionParams(**params)
    
    logger.info(f"[Execute] Describing: {validated.r2_key}")
    
    # Fetch from R2
    data, _ = await r2.fetch_object(validated.r2_key)
    
    # Generate description
    description = await genai.generate_description_from_bytes(data, validated.mime_type)
    
    return ExecuteResponse(
        success=True,
        data={"description": description},
    )


# === Polling Endpoint (for Kling) ===

@router.get("/poll/{external_task_id}")
async def poll_task(external_task_id: str, project_id: str = "unknown"):
    """Poll Kling for video completion."""
    return await kling.poll_video(external_task_id, project_id)
