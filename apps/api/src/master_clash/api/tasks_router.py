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
import json
import logging
import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from master_clash.services import r2, d1, genai
from master_clash.tools.nano_banana import nano_banana_gen, nano_banana_pro_gen

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# Constants
LEASE_DURATION_MS = 3 * 60 * 1000  # 3 minutes
HEARTBEAT_INTERVAL_MS = 30 * 1000  # 30 seconds
WORKER_ID = f"worker_{uuid.uuid4().hex[:8]}"  # Unique per process

# Task types
TaskType = Literal["image_gen", "video_gen", "image_desc", "video_desc"]

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
         json.dumps({**params, "node_id": node_id, "callback_url": callback_url}), now, now]
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
        [STATUS_COMPLETED, result_url, json.dumps(result_data) if result_data else None, now, now, task_id]
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
    from master_clash.tools.nano_banana import nano_banana_gen
    
    callback_url = params.get("callback_url")
    node_id = params.get("node_id")
    
    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] Processing image_gen: {task_id}")
        
        prompt = params.get("prompt", "")
        
        # Start heartbeat
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))
        
        try:
            # Generate image (sync function, run in thread pool)
            result_base64 = await asyncio.to_thread(nano_banana_pro_gen, prompt)
            
            if result_base64:
                # Upload to R2 (async)
                image_data = base64.b64decode(result_base64)
                r2_key = f"projects/{params.get('project_id')}/generated/{task_id}.png"
                await r2.put_object(r2_key, image_data, "image/png")
                
                await complete_task(task_id, result_url=r2_key)
                
                # Callback to Loro
                await callback_to_loro(callback_url, node_id, {
                    "src": r2_key,
                    "status": "completed",
                    "pendingTask": None
                })
            else:
                await fail_task(task_id, "No image generated")
                await callback_to_loro(callback_url, node_id, {
                    "status": "failed",
                    "error": "No image generated",
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
    from master_clash.services import kling
    
    callback_url = params.get("callback_url")
    node_id = params.get("node_id")
    
    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] Processing video_gen: {task_id}")
        
        image_r2_key = params.get("image_r2_key")
        prompt = params.get("prompt", "")
        duration = params.get("duration", 5)
        
        if not image_r2_key:
            await fail_task(task_id, "image_r2_key is required for video generation")
            await callback_to_loro(callback_url, node_id, {
                "status": "failed",
                "error": "No source image",
                "pendingTask": None
            })
            return
        
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))
        
        try:
            logger.info(f"[Tasks] Submitting to Kling with image: {image_r2_key}")
            
            # Submit to Kling API (it will fetch from R2 internally)
            result = await kling.submit_video(
                image_r2_key=image_r2_key,
                prompt=prompt,
                duration=duration,
            )
            
            if not result.get("success"):
                await fail_task(task_id, result.get("error", "Kling submit failed"))
                await callback_to_loro(callback_url, node_id, {
                    "status": "failed",
                    "error": result.get("error"),
                    "pendingTask": None
                })
                return
            
            external_task_id = result.get("external_task_id")
            logger.info(f"[Tasks] Kling task submitted: {external_task_id}")
            
            # Store external_task_id for polling
            await d1.execute(
                "UPDATE aigc_tasks SET external_task_id = ?, external_service = ? WHERE task_id = ?",
                [external_task_id, "kling", task_id]
            )
            
            # Poll until complete
            max_polls = 60  # 5 minutes at 5s intervals
            for i in range(max_polls):
                await asyncio.sleep(30)
                
                poll_result = await kling.poll_video(external_task_id, params.get("project_id", "unknown"))
                poll_status = poll_result.get("status")
                logger.info(f"[Tasks] Kling poll {i+1}: status={poll_status}")
                
                if poll_status == "completed":
                    # kling.py already uploaded to R2 and returns r2_key
                    r2_key = poll_result.get("r2_key")
                    await complete_task(task_id, result_url=r2_key)
                    await callback_to_loro(callback_url, node_id, {
                        "src": r2_key,
                        "status": "completed",
                        "pendingTask": None
                    })
                    return
                elif poll_status == "failed":
                    await fail_task(task_id, poll_result.get("error", "Video generation failed"))
                    await callback_to_loro(callback_url, node_id, {
                        "status": "failed",
                        "error": poll_result.get("error"),
                        "pendingTask": None
                    })
                    return
                # else: still pending, continue polling
            
            # Timeout
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
        "image_desc": process_image_description,
        "video_desc": process_video_description,
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
    
    params = json.loads(task.get("params", "{}"))
    result_data = json.loads(task.get("result_data") or "{}")
    
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
