"""
Unified AIGC Tasks API Router.

Python API as AIGC Provider:
- POST /api/tasks/submit - Submit task
- GET /api/tasks/{task_id} - Get status
- POST /api/tasks/{task_id}/heartbeat - Renew lease

Task Types:
- image_gen: Generate image with Gemini
- image_desc: Generate description for image
- video_desc: Generate description for video
"""

import asyncio
import base64
import logging
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from master_clash.json_utils import dumps as json_dumps
from master_clash.json_utils import loads as json_loads
from master_clash.services import d1, genai, generation_models, r2
from master_clash.services.generation_models import (
    ImageGenerationRequest,
    VideoGenerationRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# Constants
LEASE_DURATION_MS = 3 * 60 * 1000  # 3 minutes
HEARTBEAT_INTERVAL_MS = 30 * 1000  # 30 seconds
WORKER_ID = f"worker_{uuid.uuid4().hex[:8]}"  # Unique per process

# Task types
TaskType = Literal["image_gen", "video_gen", "audio_gen", "image_desc", "video_desc", "video_render"]

# Status constants
STATUS_PENDING = "pending"
STATUS_PROCESSING = "processing"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"


# === Models ===

class TaskSubmitRequest(BaseModel):
    """Submit a new task."""
    task_type: TaskType = Field(..., description="Type of task")
    project_id: str = Field(..., description="Project ID")
    node_id: str | None = Field(default=None, description="Node ID to update")
    params: dict = Field(default_factory=dict, description="Task parameters")
    callback_url: str | None = Field(default=None, description="URL to callback when task completes")


class TaskSubmitResponse(BaseModel):
    """Response after submitting task."""
    task_id: str
    status: str = STATUS_PENDING


class TaskStatusResponse(BaseModel):
    """Task status response."""
    task_id: str
    task_type: str
    status: str
    result_url: str | None = None
    result_data: dict | None = None
    error: str | None = None
    project_id: str | None = None
    node_id: str | None = None


# === D1 Operations ===

async def create_task(
    task_id: str,
    task_type: str,
    project_id: str,
    node_id: str | None,
    params: dict,
    callback_url: str | None = None,
) -> None:
    """Create task in D1."""
    now = int(datetime.utcnow().timestamp() * 1000)
    
    await d1.execute(
        """INSERT INTO aigc_tasks 
           (task_id, project_id, task_type, provider, status, params, 
            created_at, updated_at, max_retries)
           VALUES (?, ?, ?, 'python', ?, ?, ?, ?, 3)""",
        [task_id, project_id, task_type, STATUS_PENDING, 
         json_dumps({**params, "node_id": node_id, "callback_url": callback_url}), now, now]
    )


async def claim_task(task_id: str) -> bool:
    """Claim task with lease."""
    now = int(datetime.utcnow().timestamp() * 1000)
    lease_expires = now + LEASE_DURATION_MS
    
    await d1.execute(
        """UPDATE aigc_tasks 
           SET status = ?, worker_id = ?, heartbeat_at = ?, lease_expires_at = ?, updated_at = ?
           WHERE task_id = ? AND status = ?""",
        [STATUS_PROCESSING, WORKER_ID, now, lease_expires, now, task_id, STATUS_PENDING]
    )
    return True


async def renew_lease(task_id: str) -> bool:
    """Renew task lease."""
    now = int(datetime.utcnow().timestamp() * 1000)
    lease_expires = now + LEASE_DURATION_MS
    
    await d1.execute(
        """UPDATE aigc_tasks 
           SET heartbeat_at = ?, lease_expires_at = ?, updated_at = ?
           WHERE task_id = ? AND worker_id = ?""",
        [now, lease_expires, now, task_id, WORKER_ID]
    )
    return True


async def complete_task(task_id: str, result_url: str = None, result_data: dict = None) -> None:
    """Mark task completed."""
    now = int(datetime.utcnow().timestamp() * 1000)
    
    await d1.execute(
        """UPDATE aigc_tasks 
           SET status = ?, result_url = ?, result_data = ?, updated_at = ?, completed_at = ?
           WHERE task_id = ?""",
        [STATUS_COMPLETED, result_url, json_dumps(result_data) if result_data else None, now, now, task_id]
    )


async def fail_task(task_id: str, error: str) -> None:
    """Mark task failed."""
    now = int(datetime.utcnow().timestamp() * 1000)
    
    await d1.execute(
        """UPDATE aigc_tasks 
           SET status = ?, error_message = ?, updated_at = ?
           WHERE task_id = ?""",
        [STATUS_FAILED, error, now, task_id]
    )


async def get_task(task_id: str) -> dict | None:
    """Get task from D1."""
    return await d1.query_one("SELECT * FROM aigc_tasks WHERE task_id = ?", [task_id])


async def callback_to_loro(
    callback_url: str,
    node_id: str,
    updates: dict
) -> None:
    """
    Callback to Loro Sync Server with node updates.
    Fire-and-forget with simple retry.
    """
    if not callback_url or not node_id:
        return
    
    import httpx
    
    payload = {"nodeId": node_id, "updates": updates}
    
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(callback_url, json=payload)
                if resp.status_code == 200:
                    logger.info(f"[Callback] ✅ Node {node_id[:8]} updated")
                    return
                logger.warning(f"[Callback] ⚠️ Attempt {attempt+1} failed: {resp.status_code}")
        except Exception as e:
            logger.warning(f"[Callback] ⚠️ Attempt {attempt+1} error: {e}")
        
        await asyncio.sleep(1)
    
    logger.error(f"[Callback] ❌ Failed after 3 attempts for node {node_id[:8]}")


# === Task Processors ===

async def process_image_generation(task_id: str, params: dict) -> None:
    """Generate image using Gemini."""
    callback_url = params.get("callback_url")
    node_id = params.get("node_id")

    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] 🎨 Processing image_gen: {task_id}, node: {node_id}")
        logger.info(f"[Tasks] 📋 Params: {params}")

        prompt = params.get("prompt", "")
        model_id = params.get("model") or params.get("model_id")
        model_params = params.get("model_params") or {}
        reference_images = params.get("reference_images") or params.get("referenceImageUrls") or []

        # Support legacy aspect_ratio field
        if params.get("aspect_ratio") and "aspect_ratio" not in model_params:
            model_params["aspect_ratio"] = params.get("aspect_ratio")

        logger.info(f"[Tasks] 🚀 Calling generation_models.generate_image with model={model_id or generation_models.DEFAULT_IMAGE_MODEL}")

        # Start heartbeat
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))

        try:
            generation_result = await generation_models.generate_image(
                ImageGenerationRequest(
                    prompt=prompt,
                    model_id=model_id or generation_models.DEFAULT_IMAGE_MODEL,
                    params=model_params,
                    reference_images=reference_images,
                )
            )

            if generation_result.success and generation_result.base64_data:
                image_data = base64.b64decode(generation_result.base64_data)
                r2_key = f"projects/{params.get('project_id')}/generated/{task_id}.png"
                await r2.put_object(r2_key, image_data, "image/png")

                await complete_task(task_id, result_url=r2_key)

                await callback_to_loro(callback_url, node_id, {
                    "src": r2_key,
                    "status": "completed",
                    "pendingTask": None,
                    "model": model_id or generation_models.DEFAULT_IMAGE_MODEL,
                })
            else:
                error_message = generation_result.error or "No image generated"
                await fail_task(task_id, error_message)
                await callback_to_loro(callback_url, node_id, {
                    "status": "failed",
                    "error": error_message,
                    "pendingTask": None
                })
        finally:
            heartbeat_task.cancel()
            
    except Exception as e:
        logger.error(f"[Tasks] image_gen failed: {e}")
        await fail_task(task_id, str(e))
        await callback_to_loro(callback_url, node_id, {
            "status": "failed",
            "error": str(e),
            "pendingTask": None
        })


async def process_audio_generation(task_id: str, params: dict) -> None:
    """Generate audio/speech using TTS."""
    callback_url = params.get("callback_url")
    node_id = params.get("node_id")

    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] 🎵 Processing audio_gen: {task_id}, node: {node_id}")
        logger.info(f"[Tasks] 📋 Params: {params}")

        text = params.get("prompt", "")
        model_id = params.get("model") or params.get("model_id")
        model_params = params.get("model_params") or {}
        project_id = params.get("project_id")

        logger.info(f"[Tasks] 🚀 Calling generation_models.generate_audio with model={model_id or generation_models.DEFAULT_AUDIO_MODEL}")

        # Start heartbeat
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))

        try:
            generation_result = await generation_models.generate_audio(
                generation_models.AudioGenerationRequest(
                    text=text,
                    project_id=project_id,
                    model_id=model_id or generation_models.DEFAULT_AUDIO_MODEL,
                    params=model_params,
                )
            )

            if generation_result.success and generation_result.r2_key:
                await complete_task(task_id, result_url=generation_result.r2_key)

                await callback_to_loro(callback_url, node_id, {
                    "src": generation_result.r2_key,
                    "status": "completed",
                    "pendingTask": None,
                    "model": model_id or generation_models.DEFAULT_AUDIO_MODEL,
                })
            else:
                error_message = generation_result.error or "No audio generated"
                await fail_task(task_id, error_message)
                await callback_to_loro(callback_url, node_id, {
                    "status": "failed",
                    "error": error_message,
                    "pendingTask": None
                })
        finally:
            heartbeat_task.cancel()

    except Exception as e:
        logger.exception(f"[Tasks] ❌ audio_gen failed for {task_id}")
        await fail_task(task_id, str(e))
        await callback_to_loro(callback_url, node_id, {
            "status": "failed",
            "error": str(e),
            "pendingTask": None
        })


async def process_image_description(task_id: str, params: dict) -> None:
    """Generate description for image."""
    callback_url = params.get("callback_url")
    node_id = params.get("node_id")
    
    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] Processing image_desc: {task_id} params: {params}")
        
        r2_key = params.get("r2_key")
        mime_type = params.get("mime_type", "image/png")
        
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))
        
        try:
            # Fetch from R2 (async)
            data, _ = await r2.fetch_object(r2_key)
            
            # Generate description (async)
            description = await genai.generate_description_from_bytes(data, mime_type)
            
            await complete_task(task_id, result_data={"description": description})
            
            # Callback to Loro
            await callback_to_loro(callback_url, node_id, {
                "description": description,
                "status": "fin",
                "pendingTask": None
            })
        finally:
            heartbeat_task.cancel()
            
    except Exception as e:
        logger.error(f"[Tasks] image_desc failed: {e}")
        await fail_task(task_id, str(e))
        await callback_to_loro(callback_url, node_id, {
            "status": "fin",  # Mark as fin even on failure
            "pendingTask": None
        })


async def process_video_description(task_id: str, params: dict) -> None:
    """Generate description for video."""
    callback_url = params.get("callback_url")
    node_id = params.get("node_id")
    
    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] Processing video_desc: {task_id}")
        
        r2_key = params.get("r2_key")
        mime_type = params.get("mime_type", "video/mp4")
        
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))
        
        try:
            # Fetch from R2 (async)
            data, _ = await r2.fetch_object(r2_key)
            
            # Generate description (async)
            description = await genai.generate_description_from_bytes(data, mime_type)
            
            await complete_task(task_id, result_data={"description": description})
            
            await callback_to_loro(callback_url, node_id, {
                "description": description,
                "status": "fin",
                "pendingTask": None
            })
        finally:
            heartbeat_task.cancel()
            
    except Exception as e:
        logger.error(f"[Tasks] video_desc failed: {e}", exc_info=True)
        await fail_task(task_id, str(e))
        await callback_to_loro(callback_url, node_id, {
            "status": "fin",
            "pendingTask": None
        })


async def process_video_generation(task_id: str, params: dict) -> None:
    """Generate video using Kling API."""
    callback_url = params.get("callback_url")
    node_id = params.get("node_id")
    
    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] Processing video_gen: {task_id}")
        
        prompt = params.get("prompt", "")
        model_id = params.get("model") or params.get("model_id")
        model_params = params.get("model_params") or {}
        reference_images = params.get("reference_images") or params.get("referenceImageUrls") or []
        image_r2_key = params.get("image_r2_key") or (reference_images[0] if reference_images else None)
        duration = params.get("duration", 5)
        
        if image_r2_key and "image_r2_key" not in model_params:
            model_params["image_r2_key"] = image_r2_key
        if duration and "duration" not in model_params:
            model_params["duration"] = duration
        
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))
        
        try:
            logger.info(f"[Tasks] Submitting video task with model: {model_id or generation_models.DEFAULT_VIDEO_MODEL}")
            submission = await generation_models.submit_video_job(
                VideoGenerationRequest(
                    prompt=prompt,
                    project_id=params.get("project_id", "unknown"),
                    model_id=model_id or generation_models.DEFAULT_VIDEO_MODEL,
                    params=model_params,
                    reference_images=reference_images,
                    callback_url=callback_url,
                )
            )

            if not submission.success:
                await fail_task(task_id, submission.error or "Video submit failed")
                await callback_to_loro(callback_url, node_id, {
                    "status": "failed",
                    "error": submission.error,
                    "pendingTask": None
                })
                return

            if submission.r2_key:
                await complete_task(task_id, result_url=submission.r2_key)
                await callback_to_loro(callback_url, node_id, {
                    "src": submission.r2_key,
                    "status": "completed",
                    "pendingTask": None
                })
                return

            external_task_id = submission.external_task_id
            if not external_task_id:
                await fail_task(task_id, "No external task id returned from provider")
                await callback_to_loro(callback_url, node_id, {
                    "status": "failed",
                    "error": "Video provider did not return task id",
                    "pendingTask": None
                })
                return
            logger.info(f"[Tasks] Video task submitted: {external_task_id} via {submission.provider}")
            
            await d1.execute(
                "UPDATE aigc_tasks SET external_task_id = ?, external_service = ? WHERE task_id = ?",
                [external_task_id, submission.provider, task_id]
            )
            
            max_polls = 60  # 60 * 30s = 30 minutes
            for i in range(max_polls):
                await asyncio.sleep(30)
                
                poll_result = await generation_models.poll_video_job(
                    model_id or generation_models.DEFAULT_VIDEO_MODEL,
                    external_task_id,
                    params.get("project_id", "unknown"),
                )
                logger.info(f"[Tasks] Video poll {i+1}: status={poll_result.status}")
                
                if poll_result.status == "completed":
                    r2_key = poll_result.r2_key
                    await complete_task(task_id, result_url=r2_key)
                    await callback_to_loro(callback_url, node_id, {
                        "src": r2_key,
                        "status": "completed",
                        "pendingTask": None
                    })
                    return
                elif poll_result.status == "failed":
                    await fail_task(task_id, poll_result.error or "Video generation failed")
                    await callback_to_loro(callback_url, node_id, {
                        "status": "failed",
                        "error": poll_result.error,
                        "pendingTask": None
                    })
                    return
                # else: still pending, continue polling
            
            await fail_task(task_id, "Video generation timed out")
            await callback_to_loro(callback_url, node_id, {
                "status": "failed",
                "error": "Video generation timed out",
                "pendingTask": None
            })
            
        finally:
            heartbeat_task.cancel()
            
    except Exception as e:
        logger.error(f"[Tasks] video_gen failed: {e}", exc_info=True)
        await fail_task(task_id, str(e))
        await callback_to_loro(callback_url, node_id, {
            "status": "failed",
            "error": str(e),
            "pendingTask": None
        })


async def _heartbeat_loop(task_id: str) -> None:
    """Background loop to renew lease."""
    try:
        while True:
            await asyncio.sleep(HEARTBEAT_INTERVAL_MS / 1000)
            await renew_lease(task_id)
            logger.debug(f"[Tasks] Heartbeat: {task_id}")
    except asyncio.CancelledError:
        pass


async def process_video_render(task_id: str, params: dict) -> None:
    """
    Render video using Remotion CLI with Timeline DSL.

    This is different from video_gen (which generates new video using AI).
    video_render composites existing assets (videos, images, audio, text) using a timeline.
    """
    callback_url = params.get("callback_url")
    node_id = params.get("node_id")
    project_id = params.get("project_id", "unknown")

    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] 🎬 Processing video_render: {task_id}, node: {node_id}")

        timeline_dsl = params.get("timeline_dsl", {})
        if not timeline_dsl:
            raise ValueError("Missing timeline_dsl in params")

        logger.info(f"[Tasks] 📋 Timeline DSL: {json_dumps(timeline_dsl)[:500]}...")

        # Start heartbeat
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))

        try:
            # Import render service (lazy import to avoid circular dependency)
            from master_clash.services.remotion_render import render_video_with_remotion

            result = await render_video_with_remotion(
                timeline_dsl=timeline_dsl,
                project_id=project_id,
                task_id=task_id,
            )

            if result.success and result.r2_key:
                await complete_task(task_id, result_url=result.r2_key)

                await callback_to_loro(callback_url, node_id, {
                    "src": result.r2_key,
                    "status": "completed",
                    "pendingTask": None
                })
                logger.info(f"[Tasks] ✅ video_render completed: {result.r2_key}")
            else:
                error_message = result.error or "Render failed"
                await fail_task(task_id, error_message)
                await callback_to_loro(callback_url, node_id, {
                    "status": "failed",
                    "error": error_message,
                    "pendingTask": None
                })

        finally:
            heartbeat_task.cancel()

    except Exception as e:
        logger.error(f"[Tasks] ❌ video_render failed: {e}", exc_info=True)
        await fail_task(task_id, str(e))
        await callback_to_loro(callback_url, node_id, {
            "status": "failed",
            "error": str(e),
            "pendingTask": None
        })


# === Endpoints ===

@router.post("/submit", response_model=TaskSubmitResponse)
async def submit_task(request: TaskSubmitRequest, background_tasks: BackgroundTasks):
    """Submit an AIGC task."""
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    
    logger.info(f"[Tasks] Submit {request.task_type}: {task_id} {request.callback_url}")
    
    # Create task in D1
    await create_task(
        task_id, request.task_type, request.project_id, request.node_id, request.params, request.callback_url
    )
    
    # Start background processing
    processor = {
        "image_gen": process_image_generation,
        "video_gen": process_video_generation,
        "audio_gen": process_audio_generation,
        "image_desc": process_image_description,
        "video_desc": process_video_description,
        "video_render": process_video_render,
    }.get(request.task_type)
    
    if processor:
        # Include callback_url and node_id in params for callback
        processor_params = {
            **request.params,
            "project_id": request.project_id,
            "node_id": request.node_id,
            "callback_url": request.callback_url,
        }
        background_tasks.add_task(processor, task_id, processor_params)
    
    return TaskSubmitResponse(task_id=task_id)


@router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Get task status."""
    task = await get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    params = json_loads(task.get("params", "{}"))
    result_data = json_loads(task.get("result_data") or "{}")
    
    return TaskStatusResponse(
        task_id=task_id,
        task_type=task["task_type"],
        status=task["status"],
        result_url=task.get("result_url"),
        result_data=result_data if result_data else None,
        error=task.get("error_message"),
        project_id=task.get("project_id"),
        node_id=params.get("node_id"),
    )


@router.post("/{task_id}/heartbeat")
async def heartbeat(task_id: str):
    """Renew task lease."""
    await renew_lease(task_id)
    return {"status": "ok"}
