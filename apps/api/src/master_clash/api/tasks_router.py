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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# Constants
LEASE_DURATION_MS = 3 * 60 * 1000  # 3 minutes
HEARTBEAT_INTERVAL_MS = 30 * 1000  # 30 seconds
WORKER_ID = f"worker_{uuid.uuid4().hex[:8]}"  # Unique per process

# Task types
TaskType = Literal["image_gen", "image_desc", "video_desc"]

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
    params: dict = Field(..., description="Task parameters")


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
) -> None:
    """Create task in D1."""
    now = int(datetime.utcnow().timestamp() * 1000)
    
    await d1.execute(
        """INSERT INTO aigc_tasks 
           (task_id, project_id, task_type, provider, status, params, 
            created_at, updated_at, max_retries)
           VALUES (?, ?, ?, 'python', ?, ?, ?, ?, 3)""",
        [task_id, project_id, task_type, STATUS_PENDING, 
         json.dumps({**params, "node_id": node_id}), now, now]
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


# === Task Processors ===

async def process_image_generation(task_id: str, params: dict) -> None:
    """Generate image using Gemini."""
    from master_clash.tools.nano_banana import nano_banana_gen
    
    try:
        await claim_task(task_id)
        logger.info(f"[Tasks] Processing image_gen: {task_id}")
        
        prompt = params.get("prompt", "")
        
        # Start heartbeat
        heartbeat_task = asyncio.create_task(_heartbeat_loop(task_id))
        
        try:
            # Generate image (sync function, run in thread pool)
            result_base64 = await asyncio.to_thread(nano_banana_gen, prompt)
            
            if result_base64:
                # Upload to R2 (async)
                image_data = base64.b64decode(result_base64)
                r2_key = f"projects/{params.get('project_id')}/generated/{task_id}.png"
                await r2.put_object(r2_key, image_data, "image/png")
                
                # Store Object Key as result_url so downstream consumers can construct the full URL
                result_url = r2_key
                await complete_task(task_id, result_url=result_url)
            else:
                await fail_task(task_id, "No image generated")
        finally:
            heartbeat_task.cancel()
            
    except Exception as e:
        logger.error(f"[Tasks] image_gen failed: {e}")
        await fail_task(task_id, str(e))


async def process_image_description(task_id: str, params: dict) -> None:
    """Generate description for image."""
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
        finally:
            heartbeat_task.cancel()
            
    except Exception as e:
        logger.error(f"[Tasks] image_desc failed: {e}")
        await fail_task(task_id, str(e))


async def process_video_description(task_id: str, params: dict) -> None:
    """Generate description for video."""
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
        finally:
            heartbeat_task.cancel()
            
    except Exception as e:
        logger.error(f"[Tasks] video_desc failed: {e}", exc_info=True)
        await fail_task(task_id, str(e))


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
    
    logger.info(f"[Tasks] Submit {request.task_type}: {task_id}")
    
    # Create task in D1
    await create_task(
        task_id, request.task_type, request.project_id, request.node_id, request.params
    )
    
    # Start background processing
    processor = {
        "image_gen": process_image_generation,
        "image_desc": process_image_description,
        "video_desc": process_video_description,
    }.get(request.task_type)
    
    if processor:
        background_tasks.add_task(processor, task_id, {**request.params, "project_id": request.project_id})
    
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
