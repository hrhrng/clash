"""
Description generation API router.

Endpoints:
- POST /api/describe/submit - Submit description task
- GET /api/describe/{task_id} - Get task status
"""

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from master_clash.json_utils import dumps as json_dumps
from master_clash.json_utils import loads as json_loads
from master_clash.services import r2, d1, genai

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/describe", tags=["describe"])

# Task status constants
STATUS_PENDING = "pending"
STATUS_PROCESSING = "processing"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"


# === Models ===

class DescribeSubmitRequest(BaseModel):
    """Request to submit a description task."""
    r2_key: str = Field(..., description="R2 object key")
    mime_type: str = Field(..., description="MIME type")
    project_id: str = Field(..., description="Project ID")
    node_id: str = Field(..., description="Node ID")


class DescribeSubmitResponse(BaseModel):
    """Response with task ID."""
    task_id: str
    status: str = STATUS_PENDING


class DescribeStatusResponse(BaseModel):
    """Task status response."""
    task_id: str
    status: str
    description: str | None = None
    error: str | None = None
    node_id: str | None = None
    project_id: str | None = None


# === Task Operations ===

async def create_task(task_id: str, project_id: str, node_id: str, r2_key: str, mime_type: str) -> None:
    """Create task in D1."""
    now = int(datetime.utcnow().timestamp() * 1000)
    params = json_dumps({"r2_key": r2_key, "mime_type": mime_type, "node_id": node_id})
    
    await d1.execute(
        """INSERT INTO aigc_tasks 
           (task_id, project_id, task_type, status, params, created_at, updated_at, max_retries)
           VALUES (?, ?, 'description', ?, ?, ?, ?, 3)""",
        [task_id, project_id, STATUS_PENDING, params, now, now]
    )


async def update_task(task_id: str, status: str, result_data: dict = None, error: str = None) -> None:
    """Update task in D1."""
    now = int(datetime.utcnow().timestamp() * 1000)
    
    if status == STATUS_COMPLETED and result_data:
        await d1.execute(
            """UPDATE aigc_tasks 
               SET status = ?, result_data = ?, updated_at = ?, completed_at = ?
               WHERE task_id = ?""",
            [status, json_dumps(result_data), now, now, task_id]
        )
    elif status == STATUS_FAILED and error:
        await d1.execute(
            """UPDATE aigc_tasks SET status = ?, error_message = ?, updated_at = ? WHERE task_id = ?""",
            [status, error, now, task_id]
        )
    else:
        await d1.execute(
            """UPDATE aigc_tasks SET status = ?, updated_at = ? WHERE task_id = ?""",
            [status, now, task_id]
        )


async def get_task(task_id: str) -> dict | None:
    """Get task from D1."""
    return await d1.query_one("SELECT * FROM aigc_tasks WHERE task_id = ?", [task_id])


# === Background Processing ===

async def process_description_task(task_id: str, r2_key: str, mime_type: str) -> None:
    """Background task to generate description."""
    try:
        logger.info(f"[Describe] Processing {task_id}")
        await update_task(task_id, STATUS_PROCESSING)
        
        # Fetch from R2 using S3 client
        data, _ = await r2.fetch_object(r2_key)
        
        # Generate description using LangChain + Vertex AI
        description = await genai.generate_description_from_bytes(data, mime_type)
        
        await update_task(task_id, STATUS_COMPLETED, result_data={"description": description})
        logger.info(f"[Describe] Completed {task_id}")
        
    except Exception as e:
        logger.error(f"[Describe] Failed {task_id}: {e}")
        await update_task(task_id, STATUS_FAILED, error=str(e))


# === Endpoints ===

@router.post("/submit", response_model=DescribeSubmitResponse)
async def submit_description_task(request: DescribeSubmitRequest, background_tasks: BackgroundTasks):
    """Submit description generation task."""
    task_id = f"desc_{uuid.uuid4().hex[:12]}"
    
    logger.info(f"[Describe] Submit {task_id} for {request.r2_key}")
    
    await create_task(task_id, request.project_id, request.node_id, request.r2_key, request.mime_type)
    
    background_tasks.add_task(process_description_task, task_id, request.r2_key, request.mime_type)
    
    return DescribeSubmitResponse(task_id=task_id)


@router.get("/{task_id}", response_model=DescribeStatusResponse)
async def get_description_status(task_id: str):
    """Get description task status."""
    task = await get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    params = json_loads(task.get("params", "{}"))
    result_data = json_loads(task.get("result_data") or "{}")
    
    return DescribeStatusResponse(
        task_id=task_id,
        status=task["status"],
        description=result_data.get("description"),
        error=task.get("error_message"),
        node_id=params.get("node_id"),
        project_id=task.get("project_id"),
    )
