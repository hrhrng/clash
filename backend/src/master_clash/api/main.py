"""
FastAPI server for Master Clash backend.
Handles AI generation - returns base64 images or temporary URLs.
Frontend handles storage and database.
"""
from contextlib import asynccontextmanager
from typing import Any

import logging
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
import asyncio
import json

from master_clash.config import get_settings
from master_clash.tools.nano_banana import nano_banana_gen
from master_clash.tools.nano_banana import nano_banana_gen
from master_clash.tools.kling_video import kling_video_gen
from master_clash.tools.description import generate_description
import requests


# Configure logging
settings = get_settings()
logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("backend.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Master Clash API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class GenerateImageRequest(BaseModel):
    """Request to generate image using Nano Banana."""
    prompt: str = Field(..., description="Image generation prompt")
    system_prompt: str = Field(default="", description="System-level instructions")
    aspect_ratio: str = Field(default="16:9", description="Image aspect ratio")
    base64_images: list[str] = Field(default=[], description="List of base64 encoded reference images")
    model_name: str | None = Field(default="gemini-2.5-flash-image", description="Model to use")
    callback_url: str | None = Field(default=None, description="Callback URL for status updates")



class GenerateImageResponse(BaseModel):
    """Response with base64 encoded image."""
    base64: str | None = Field(default=None, description="Base64 encoded image data (if available)")
    model: str = Field(default="gemini-2.5-flash-image", description="Model used")
    task_id: str = Field(..., description="Internal task ID for polling")


class GenerateVideoRequest(BaseModel):
    """Request to generate video using Kling."""
    image_url: str = Field(..., description="Source image URL")
    base64_images: list[str] = Field(default=[], description="Optional base64 images")
    prompt: str = Field(..., description="Video generation prompt")
    duration: int = Field(default=5, description="Duration in seconds")
    cfg_scale: float = Field(default=0.5, description="CFG Scale")
    model: str = Field(default="kling-v1", description="Model version")
    callback_url: str | None = Field(default=None, description="Callback URL for status updates")


class GenerateVideoResponse(BaseModel):
    """Response for video generation task."""
    url: str | None = Field(default=None, description="Video URL if ready")
    duration: int
    model: str
    task_id: str


class WorkflowStatusResponse(BaseModel):
    """Response for workflow status."""
    project_id: str
    status: str
    progress: float
    current_step: str
    result: Any | None = None
    error: str | None = None


class GenerateDescriptionRequest(BaseModel):
    """Request to generate description for an asset."""
    url: str = Field(..., description="Asset URL or Data URI")
    task_id: str = Field(..., description="Task ID for callback")
    callback_url: str | None = Field(default=None, description="Callback URL for status updates")


class GenerateDescriptionResponse(BaseModel):
    """Response with generated description."""
    task_id: str = Field(..., description="Task ID")
    status: str = Field(default="processing", description="Task status")


def process_image_generation(internal_task_id: str, params: dict, callback_url: str = None):
    """Background task to run image generation and update frontend."""
    try:
        logger.info(f"Starting background image generation for task {internal_task_id} with callback {callback_url}")
        # Call generation (blocking)
        base64_image = nano_banana_gen(**params)
        
        # Convert to data URI if not already
        if not base64_image.startswith("data:"):
            image_url = f"data:image/png;base64,{base64_image}"
        else:
            image_url = base64_image

        # Success
        logger.info(f"Image generation successful")
        
        # Generate description
        description = None
        try:
            logger.info(f"Generating description for image...")
            description = generate_description(image_url)
            logger.info(f"Description generated: {description[:50]}...")
        except Exception as e:
            logger.error(f"Failed to generate description: {e}")

        update_asset_status(internal_task_id, "completed", url=image_url, description=description, callback_url=callback_url)
    except Exception as e:
        # Failure
        import traceback
        logger.error(f"Image generation failed: {e}")
        logger.debug(traceback.format_exc())
        update_asset_status(internal_task_id, "failed", error=str(e), callback_url=callback_url)


@app.post("/api/generate/image", response_model=GenerateImageResponse)
async def generate_image(request: GenerateImageRequest, background_tasks: BackgroundTasks):
    """
    Generate image using Nano Banana (Google Gemini).
    Returns task_id immediately - frontend polls for status.
    """
    logger.info(f"Received image generation request: {request}")
    import uuid
    internal_task_id = str(uuid.uuid4())

    # Start background task
    background_tasks.add_task(
        process_image_generation,
        internal_task_id,
        {
            "text": request.prompt,
            "system_prompt": request.system_prompt,
            "base64_images": request.base64_images,
            "aspect_ratio": request.aspect_ratio,
        },
        request.callback_url
    )

    return GenerateImageResponse(
        base64=None,
        model="gemini-2.5-flash-image",
        task_id=internal_task_id
    )


def update_asset_status(task_id: str, status: str, url: str = None, description: str = None, error: str = None, callback_url: str = None):
    """Call frontend API to update asset status."""
    # Use provided callback_url or fallback to env var / default
    if callback_url:
        frontend_url = callback_url
    else:
        import os
        # Fallback to env var (full URL) or default local URL
        frontend_url = os.getenv("DEFAULT_CALLBACK_URL", "http://localhost:3000/api/internal/assets/update")

    try:
        logger.info(f"Updating asset {task_id} to {status} at {frontend_url}")
        payload = {
            "taskId": task_id,
            "status": status,
            "url": url,
            "metadata": {"error": error} if error else {}
        }
        if description:
            payload["description"] = description
            
        response = requests.post(frontend_url, json=payload)
        if not response.ok:
            logger.error(f"Failed to update asset status: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"Failed to update asset status: {e}")


def process_video_generation(internal_task_id: str, params: dict, callback_url: str = None):
    """Background task to run video generation and update frontend."""
    try:
        logger.info(f"Starting background video generation for task {internal_task_id} with callback {callback_url}")
        # Call generation (blocking)
        video_url = kling_video_gen(**params)
        
        # Success
        logger.info(f"Video generation successful: {video_url}")

        # Generate description
        description = None
        try:
            logger.info(f"Generating description for video...")
            description = generate_description(video_url)
            logger.info(f"Description generated: {description[:50]}...")
        except Exception as e:
            logger.error(f"Failed to generate description: {e}")

        update_asset_status(internal_task_id, "completed", url=video_url, description=description, callback_url=callback_url)
    except Exception as e:
        # Failure
        import traceback
        logger.error(f"Video generation failed: {e}")
        logger.debug(traceback.format_exc())
        update_asset_status(internal_task_id, "failed", error=str(e), callback_url=callback_url)


@app.post("/api/generate/video", response_model=GenerateVideoResponse)
async def generate_video(request: GenerateVideoRequest, background_tasks: BackgroundTasks):
    """
    Generate video using Kling (image-to-video).
    Returns task_id immediately - frontend polls for status.
    """
    import uuid
    internal_task_id = str(uuid.uuid4())
    
    # Start background task
    background_tasks.add_task(
        process_video_generation, 
        internal_task_id, 
        {
            "image_path": request.image_url,
            "base64_images": request.base64_images,
            "prompt": request.prompt,
            "duration": request.duration,
            "cfg_scale": request.cfg_scale,
            "model": request.model
        },
        request.callback_url
    )

    return GenerateVideoResponse(
        url=None,
        duration=request.duration,
        model=request.model,
        task_id=internal_task_id
    )


@app.get("/api/v1/workflow/{project_id}/status", response_model=WorkflowStatusResponse)
async def get_workflow_status(project_id: str):
    """
    Get current status of a workflow execution.
    Uses LangGraph checkpointer to retrieve state.
    """
    try:
        # TODO: Query checkpointer for workflow state
        # TODO: Return current progress

        return WorkflowStatusResponse(
            project_id=project_id,
            status="running",
            progress=0.5,
            current_step="image_generation",
            result=None,
            error=None
        )
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Workflow not found: {project_id}")


def process_description_generation(task_id: str, url: str, callback_url: str = None):
    """Background task to generate description and update frontend."""
    try:
        logger.info(f"Starting background description generation for task {task_id} with callback {callback_url}")
        description = generate_description(url)
        
        if description:
            logger.info(f"Description generated successfully: {description[:50]}...")
            update_asset_status(task_id, "completed", description=description, callback_url=callback_url)
        else:
            logger.warning("Description generation returned None")
            # Optionally update status to indicate failure or just leave it?
            # Let's update with empty description to stop polling if we want
            # But for now, maybe just log it.
            
    except Exception as e:
        logger.error(f"Error in description generation task: {e}")
        import traceback
        logger.debug(traceback.format_exc())


@app.post("/api/describe", response_model=GenerateDescriptionResponse)
async def describe_asset(request: GenerateDescriptionRequest, background_tasks: BackgroundTasks):
    """Generate description for an asset (async)."""
    try:
        logger.info(f"Received async description request for task: {request.task_id}")
        background_tasks.add_task(process_description_generation, request.task_id, request.url, request.callback_url)
        return GenerateDescriptionResponse(task_id=request.task_id, status="processing")
    except Exception as e:
        logger.error(f"Error in /api/describe: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/v1/workflow/{project_id}/cancel")
async def cancel_workflow(project_id: str):
    """Cancel a running workflow."""
    try:
        # TODO: Interrupt workflow execution

        return {"project_id": project_id, "status": "cancelled"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Project Context Models ---
from typing import List, Dict, Optional

class NodeModel(BaseModel):
    id: str
    type: str
    data: Dict[str, Any]
    position: Dict[str, float]
    parentId: Optional[str] = None

class EdgeModel(BaseModel):
    id: str
    source: str
    target: str
    type: Optional[str] = None

class ProjectContext(BaseModel):
    nodes: List[NodeModel]
    edges: List[EdgeModel]

# In-memory store for project context
_PROJECT_CONTEXTS: Dict[str, ProjectContext] = {}


@app.post("/api/v1/project/{project_id}/context")
async def update_project_context(project_id: str, context: ProjectContext):
    """
    Update the context (nodes and edges) for a specific project.
    This allows the backend to be aware of the current frontend state.
    """
    logger.info(f"Received context update for project {project_id}")
    logger.info(f"Nodes: {len(context.nodes)}, Edges: {len(context.edges)}")
    # logger.debug(f"Context details: {context}") # Uncomment for full dump
    _PROJECT_CONTEXTS[project_id] = context
    return {"status": "success", "message": "Context updated"}
        

@app.get("/api/v1/stream/{project_id}")
async def stream_workflow(project_id: str, thread_id: str, resume: bool = False, user_input: str = None):
    """
    Stream LangGraph events via SSE.
    Events: thinking, text, tool_start, tool_end, human_interrupt, plan
    """
    import asyncio
    import json
    
    async def event_generator():
        # Retrieve context
        context = _PROJECT_CONTEXTS.get(project_id)
        context_info = f"Context: {len(context.nodes)} nodes, {len(context.edges)} edges" if context else "Context: None"
        
        logger.info(f"Starting SSE stream for project: {project_id}, thread: {thread_id}, resume: {resume}, input: {user_input}. {context_info}")
        
        if not resume:
            # --- Initial Flow: Propose Root Group ---
            logger.info("Starting initial flow: Proposing Root Group")
            
            # 1. Thinking
            yield f"event: thinking\ndata: {json.dumps({'content': 'User wants to create character settings. I will start with a main container group.'})}\n\n"
            await asyncio.sleep(1)

            # 2. Propose Root Group
            proposal_data = {
                "id": "proposal-root-group",
                "type": "simple",
                "nodeType": "group",
                "nodeData": {
                    "label": "Character Settings",
                },
                "message": "I suggest creating a 'Character Settings' group to organize everything."
            }
            yield f"event: node_proposal\ndata: {json.dumps(proposal_data)}\n\n"
            return

        else:
            # --- Resume Flow ---
            input_data = {}
            if user_input:
                try:
                    input_data = json.loads(user_input)
                except:
                    logger.warning(f"Failed to parse user_input: {user_input}")

            action = input_data.get("action")
            proposal_id = input_data.get("proposalId")
            created_node_id = input_data.get("createdNodeId")
            group_id = input_data.get("groupId")
            
            logger.info(f"Resuming with action: {action}, proposal: {proposal_id}, created_node: {created_node_id}, group_id: {group_id}")

            # Helper to find node ID by name in current context
            def find_node_id_by_name(name: str, project_context: ProjectContext) -> str | None:
                if not project_context:
                    logger.warning("find_node_id_by_name called but project_context is None")
                    return None
                
                logger.info(f"Searching for node with label: '{name}' in context with {len(project_context.nodes)} nodes")
                for node in project_context.nodes:
                    # logger.info(f"Checking node: {node.id}, label: {node.data.get('label')}")
                    if node.data.get("label") == name:
                        logger.info(f"Found match! ID: {node.id}")
                        return node.id
                
                logger.warning(f"No node found with label: '{name}'")
                return None

            if action == "accept":
                if proposal_id == "proposal-root-group":
                    # Root Group created. Now propose Character Group inside it.
                    yield f"event: thinking\ndata: {json.dumps({'content': 'Main group created. Now let\'s add a specific character group inside it.'})}\n\n"
                    await asyncio.sleep(1)

                    # Resolve Parent ID
                    root_group_id = find_node_id_by_name("Character Settings", context)
                    # Fallback to created_node_id if context not yet updated (though it should be)
                    if not root_group_id:
                        root_group_id = created_node_id
                    
                    logger.info(f"Resolved 'Character Settings' to ID: {root_group_id}")

                    proposal_data = {
                        "id": "proposal-char-group",
                        "type": "simple",
                        "nodeType": "group",
                        "nodeData": {
                            "label": "Character: Neo",
                        },
                        "groupId": root_group_id, # Explicit ID
                        "message": "I'll create a sub-group for the character 'Neo' inside 'Character Settings'."
                    }
                    yield f"event: node_proposal\ndata: {json.dumps(proposal_data)}\n\n"
                    return

                elif proposal_id == "proposal-char-group":
                    # Character Group created. Now propose Text Node (Description).
                    yield f"event: thinking\ndata: {json.dumps({'content': 'Character group ready. Let\'s add a description text node first.'})}\n\n"
                    await asyncio.sleep(1)

                    # Resolve Parent ID
                    char_group_id = find_node_id_by_name("Character: Neo", context)
                    if not char_group_id:
                        char_group_id = created_node_id
                    
                    logger.info(f"Resolved 'Character: Neo' to ID: {char_group_id}")

                    proposal_data = {
                        "id": "proposal-text-desc",
                        "type": "simple",
                        "nodeType": "text",
                        "nodeData": {
                            "label": "Neo Description",
                            "content": "A cyberpunk hacker named Neo, wearing a long black coat and sunglasses. Neon rain background."
                        },
                        "groupId": char_group_id, # Explicit ID
                        "message": "I'll add a text node describing Neo."
                    }
                    yield f"event: node_proposal\ndata: {json.dumps(proposal_data)}\n\n"
                    return

                elif proposal_id == "proposal-text-desc":
                    # Text Node created. Now propose first Image Gen Node (Portrait).
                    yield f"event: thinking\ndata: {json.dumps({'content': 'Description added. Now let\'s generate a portrait based on it.'})}\n\n"
                    await asyncio.sleep(1)

                    # Resolve Parent ID and Upstream ID
                    char_group_id = find_node_id_by_name("Character: Neo", context)
                    text_node_id = find_node_id_by_name("Neo Description", context)
                    
                    if not text_node_id:
                        text_node_id = created_node_id

                    logger.info(f"Resolved 'Character: Neo' to {char_group_id}, 'Neo Description' to {text_node_id}")

                    proposal_data = {
                        "id": "proposal-image-portrait",
                        "type": "generative",
                        "nodeType": "action-badge-image",
                        "nodeData": {
                            "label": "Portrait Gen",
                            "prompt": "Cyberpunk hacker Neo, close up portrait, neon lights, high detail",
                        },
                        "groupId": char_group_id, # Explicit ID
                        "upstreamNodeId": text_node_id, # Explicit ID
                        "message": "I'll generate a portrait image based on the description."
                    }
                    yield f"event: node_proposal\ndata: {json.dumps(proposal_data)}\n\n"
                    return
                
                elif proposal_id == "proposal-image-portrait":
                     # Portrait Node created. Now propose Action Pose.
                    yield f"event: thinking\ndata: {json.dumps({'content': 'Portrait generator ready. Now let\'s add an action pose generator.'})}\n\n"
                    await asyncio.sleep(1)

                    # Resolve Parent ID and Upstream ID
                    char_group_id = find_node_id_by_name("Character: Neo", context)
                    # CHANGE: Connect to Text Node (Description) instead of previous Action Node
                    text_node_id = find_node_id_by_name("Neo Description", context)

                    if not text_node_id:
                        text_node_id = created_node_id # Fallback if previous was text node (unlikely here)
                    
                    logger.info(f"Resolved 'Character: Neo' to {char_group_id}, 'Neo Description' to {text_node_id}")

                    proposal_data = {
                        "id": "proposal-image-action",
                        "type": "generative",
                        "nodeType": "action-badge-image",
                        "nodeData": {
                            "label": "Action Pose Gen",
                            "prompt": "Cyberpunk hacker Neo, dodging bullets, dynamic action pose, matrix style",
                        },
                        "groupId": char_group_id, # Explicit ID
                        "upstreamNodeId": text_node_id, # Explicit ID: Connect to Description
                        "message": "I'll also generate an action pose image."
                    }
                    yield f"event: node_proposal\ndata: {json.dumps(proposal_data)}\n\n"
                    return

                elif proposal_id == "proposal-image-action":
                    yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'All nodes created! You can now run them.'})}\n\n"
                    yield f"event: end\ndata: {{}}\n\n"
                    return

            elif action == "accept_and_run":
                # Handle run logic if needed, or just acknowledge
                yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'Node created and running.'})}\n\n"
                yield f"event: end\ndata: {{}}\n\n"
                return

            elif action == "reject":
                yield f"event: thinking\ndata: {json.dumps({'content': 'User rejected. Stopping.'})}\n\n"
                await asyncio.sleep(1)
                yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'Okay, stopping here.'})}\n\n"
                yield f"event: end\ndata: {{}}\n\n"
                return
            
            else:
                yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'Resumed.'})}\n\n"
                # Do not end here, as we might be waiting for more logic (though in this mock, maybe we should?)
                # For now, let's assume 'Resumed' implies continuing, but if no more logic, we should probably end.
                # But let's stick to the specific termination points first.
        
        logger.info(f"SSE stream finished for project: {project_id}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    import traceback
    logger.error(f"Global exception: {exc}")
    logger.debug(traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}", "type": type(exc).__name__}
    )


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "master_clash.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Disable in production
    )
