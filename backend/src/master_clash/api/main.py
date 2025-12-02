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
    import uuid
    
    async def event_generator():
        # Retrieve context
        context = _PROJECT_CONTEXTS.get(project_id)
        context_info = f"Context: {len(context.nodes)} nodes, {len(context.edges)} edges" if context else "Context: None"
        
        logger.info(f"Starting SSE stream for project: {project_id}, thread: {thread_id}, resume: {resume}, input: {user_input}. {context_info}")
        
        # --- Helper Functions ---
        def find_node_by_id(node_id: str, project_context: ProjectContext) -> NodeModel | None:
            if not project_context: return None
            for node in project_context.nodes:
                if node.id == node_id:
                    return node
            return None

        def find_output_image_id(gen_node_id: str, project_context: ProjectContext) -> str | None:
            if not project_context: return None
            # Find edge starting from gen_node_id
            for edge in project_context.edges:
                if edge.source == gen_node_id:
                    return edge.target
            return None

        # --- Deterministic IDs ---
        # We define IDs for the nodes we expect to exist in the flow
        NODE_ID_SCRIPT = "node-script-text"
        NODE_ID_CONCEPT_GROUP = "node-concept-group"
        NODE_ID_CHAR_PROMPT = "node-char-prompt"
        NODE_ID_CHAR_GEN = "node-char-gen"
        NODE_ID_SCENE_PROMPT = "node-scene-prompt"
        NODE_ID_SCENE_GEN = "node-scene-gen"
        NODE_ID_SB_GROUP = "node-sb-group"
        NODE_ID_SB_PROMPT = "node-sb-prompt"
        NODE_ID_SB_GEN1 = "node-sb-gen1"
        NODE_ID_SB_GEN2 = "node-sb-gen2"
        NODE_ID_SB_VIDEO = "node-sb-video"

        if not resume:
            # --- Initial Flow: Propose Root Group ---
            logger.info("Starting initial flow: Proposing Script")
            
            # 1. Thinking
            yield f"event: thinking\ndata: {json.dumps({'content': 'User wants a full demo scenario. I will start with the script, then concept art, then storyboard generation.'})}\n\n"
            await asyncio.sleep(1)

            # 2. Delegate to ScriptWriter
            yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'Delegating to ScriptWriter to draft the character background.'})}\n\n"
            await asyncio.sleep(0.5)

            # 3. ScriptWriter Tool Call
            tool_id_script = "call_" + str(uuid.uuid4())[:8]
            yield f"event: tool_start\ndata: {json.dumps({'agent': 'ScriptWriter', 'tool_name': 'write_script', 'args': {'topic': 'Cyberpunk Hacker Neo'}, 'id': tool_id_script})}\n\n"
            await asyncio.sleep(2.0) # Simulate writing

            script_content = "# Neo - The One\n\nA skilled hacker living a double life. By day, a software engineer; by night, a rebel searching for the truth."
            yield f"event: tool_end\ndata: {json.dumps({'agent': 'ScriptWriter', 'result': 'Script drafted.', 'id': tool_id_script})}\n\n"
            await asyncio.sleep(0.5)

            # 4. Director Proposes Script Node
            proposal_data_script = {
                "id": "proposal-script-text",
                "type": "simple",
                "nodeType": "text",
                "nodeData": {
                    "id": NODE_ID_SCRIPT, # Deterministic ID
                    "label": "Neo Script",
                    "content": script_content
                },
                "message": "Here is the drafted script. Shall I add it to the board?"
            }
            yield f"event: node_proposal\ndata: {json.dumps(proposal_data_script)}\n\n"
            
        else:
            # --- Resume Flow (Polling & Progression) ---
            logger.info(f"Resuming flow. Checking state...")

            # --- State Machine Logic ---
            
            # 1. Check Script -> Concept Group
            if find_node_by_id(NODE_ID_SCRIPT, context) and not find_node_by_id(NODE_ID_CONCEPT_GROUP, context):
                yield f"event: thinking\ndata: {json.dumps({'content': 'Script added. Now creating concept art group.'})}\n\n"
                await asyncio.sleep(1)
                
                proposal_data_group = {
                    "id": "proposal-concept-group",
                    "type": "group",
                    "nodeType": "group",
                    "nodeData": {
                        "id": NODE_ID_CONCEPT_GROUP,
                        "label": "Concept Art: Neo"
                    },
                    "message": "I'll create a group for the concept art."
                }
                yield f"event: node_proposal\ndata: {json.dumps(proposal_data_group)}\n\n"
                return

            # 2. Check Concept Group -> Character Prompt
            if find_node_by_id(NODE_ID_CONCEPT_GROUP, context) and not find_node_by_id(NODE_ID_CHAR_PROMPT, context):
                yield f"event: thinking\ndata: {json.dumps({'content': 'Group ready. Extracting character prompt.'})}\n\n"
                await asyncio.sleep(1)

                proposal_data_char_prompt = {
                    "id": "proposal-char-prompt",
                    "type": "simple",
                    "nodeType": "prompt",
                    "nodeData": {
                        "id": NODE_ID_CHAR_PROMPT,
                        "label": "Character Prompt",
                        "content": "Cyberpunk hacker Neo, male, black trench coat, sunglasses, neon rain, high contrast, digital art, detailed face"
                    },
                    "groupId": NODE_ID_CONCEPT_GROUP,
                    "upstreamNodeId": NODE_ID_SCRIPT,
                    "message": "Here is the prompt for the character design."
                }
                yield f"event: node_proposal\ndata: {json.dumps(proposal_data_char_prompt)}\n\n"
                return

            # 3. Check Character Prompt -> Character Gen
            if find_node_by_id(NODE_ID_CHAR_PROMPT, context) and not find_node_by_id(NODE_ID_CHAR_GEN, context):
                proposal_data_char_gen = {
                    "id": "proposal-char-gen",
                    "type": "generative",
                    "nodeType": "action-badge-image",
                    "nodeData": {
                        "id": NODE_ID_CHAR_GEN,
                        "label": "Gen: Character",
                    },
                    "groupId": NODE_ID_CONCEPT_GROUP,
                    "upstreamNodeId": NODE_ID_CHAR_PROMPT,
                    "autoRun": True,
                    "message": "I'll add the generation node for the character."
                }
                yield f"event: node_proposal\ndata: {json.dumps(proposal_data_char_gen)}\n\n"
                return

            # 4. Check Character Gen -> Scene Prompt (WAIT FOR GEN)
            if find_node_by_id(NODE_ID_CHAR_GEN, context) and not find_node_by_id(NODE_ID_SCENE_PROMPT, context):
                # Check if output image exists
                char_img_id = find_output_image_id(NODE_ID_CHAR_GEN, context)
                if not char_img_id:
                    # Still generating
                    yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'Waiting for character generation...'})}\n\n"
                    yield f"event: retry\ndata: {{}}\n\n"
                    return
                else:
                    # Done! Proceed.
                    yield f"event: thinking\ndata: {json.dumps({'content': 'Character image found. Moving to scene creation.'})}\n\n"
                    await asyncio.sleep(1)

                    proposal_data_scene_prompt = {
                        "id": "proposal-scene-prompt",
                        "type": "simple",
                        "nodeType": "prompt",
                        "nodeData": {
                            "id": NODE_ID_SCENE_PROMPT,
                            "label": "Scene Prompt",
                            "content": "Futuristic cyberpunk city street, night, neon lights, rain, wet pavement, towering skyscrapers, dystopian atmosphere"
                        },
                        "groupId": NODE_ID_CONCEPT_GROUP,
                        "upstreamNodeId": NODE_ID_SCRIPT,
                        "message": "Great character! Now here is the prompt for the scene."
                    }
                    yield f"event: node_proposal\ndata: {json.dumps(proposal_data_scene_prompt)}\n\n"
                    return

            # 5. Check Scene Prompt -> Scene Gen
            if find_node_by_id(NODE_ID_SCENE_PROMPT, context) and not find_node_by_id(NODE_ID_SCENE_GEN, context):
                proposal_data_scene_gen = {
                    "id": "proposal-scene-gen",
                    "type": "generative",
                    "nodeType": "action-badge-image",
                    "nodeData": {
                        "id": NODE_ID_SCENE_GEN,
                        "label": "Gen: Scene",
                    },
                    "groupId": NODE_ID_CONCEPT_GROUP,
                    "upstreamNodeId": NODE_ID_SCENE_PROMPT,
                    "autoRun": True,
                    "message": "I'll add the generation node for the scene."
                }
                yield f"event: node_proposal\ndata: {json.dumps(proposal_data_scene_gen)}\n\n"
                return

            # 6. Check Scene Gen -> Storyboard Group (WAIT FOR GEN)
            if find_node_by_id(NODE_ID_SCENE_GEN, context) and not find_node_by_id(NODE_ID_SB_GROUP, context):
                scene_img_id = find_output_image_id(NODE_ID_SCENE_GEN, context)
                if not scene_img_id:
                    yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'Waiting for scene generation...'})}\n\n"
                    yield f"event: retry\ndata: {{}}\n\n"
                    return
                else:
                    yield f"event: thinking\ndata: {json.dumps({'content': 'Scene ready. Setting up the storyboard.'})}\n\n"
                    await asyncio.sleep(1)

                    proposal_data_sb_group = {
                        "id": "proposal-storyboard-group",
                        "type": "group",
                        "nodeType": "group",
                        "nodeData": {
                            "id": NODE_ID_SB_GROUP,
                            "label": "Storyboard: Act 1"
                        },
                        "message": "I'll create a group for the storyboard."
                    }
                    yield f"event: node_proposal\ndata: {json.dumps(proposal_data_sb_group)}\n\n"
                    return

            # 7. Check Storyboard Group -> SB Prompt
            if find_node_by_id(NODE_ID_SB_GROUP, context) and not find_node_by_id(NODE_ID_SB_PROMPT, context):
                proposal_data_prompt = {
                    "id": "proposal-sb-prompt",
                    "type": "simple",
                    "nodeType": "prompt",
                    "nodeData": {
                        "id": NODE_ID_SB_PROMPT,
                        "label": "Scene 1 Prompt",
                        "content": "Neo standing on a rooftop in the rain, looking at the neon city skyline."
                    },
                    "groupId": NODE_ID_SB_GROUP,
                    "upstreamNodeId": NODE_ID_SCRIPT,
                    "message": "I've extracted the prompt for Scene 1."
                }
                yield f"event: node_proposal\ndata: {json.dumps(proposal_data_prompt)}\n\n"
                return

            # 8. Check SB Prompt -> SB Gen 1
            if find_node_by_id(NODE_ID_SB_PROMPT, context) and not find_node_by_id(NODE_ID_SB_GEN1, context):
                # Find Concept Images for reference
                char_img_id = find_output_image_id(NODE_ID_CHAR_GEN, context)
                scene_img_id = find_output_image_id(NODE_ID_SCENE_GEN, context)

                upstream_ids = [NODE_ID_SB_PROMPT]
                if char_img_id: upstream_ids.append(char_img_id)
                if scene_img_id: upstream_ids.append(scene_img_id)

                proposal_data_gen1 = {
                    "id": "proposal-sb-gen1",
                    "type": "generative",
                    "nodeType": "action-badge-image",
                    "nodeData": {
                        "id": NODE_ID_SB_GEN1,
                        "label": "Gen: Static Shot 1",
                    },
                    "groupId": NODE_ID_SB_GROUP,
                    "upstreamNodeIds": upstream_ids,
                    "autoRun": True,
                    "message": "I'll set up the generation node, using the prompt and your concept art."
                }
                yield f"event: node_proposal\ndata: {json.dumps(proposal_data_gen1)}\n\n"
                return

            # 9. Check SB Gen 1 -> SB Gen 2 (WAIT FOR GEN)
            if find_node_by_id(NODE_ID_SB_GEN1, context) and not find_node_by_id(NODE_ID_SB_GEN2, context):
                shot1_img_id = find_output_image_id(NODE_ID_SB_GEN1, context)
                if not shot1_img_id:
                    yield f"event: text\ndata: {json.dumps({'agent': 'StoryboardArtist', 'content': 'Waiting for the first shot...'})}\n\n"
                    yield f"event: retry\ndata: {{}}\n\n"
                    return
                else:
                    yield f"event: thinking\ndata: {json.dumps({'content': 'Shot 1 captured. Now for the close-up.'})}\n\n"
                    await asyncio.sleep(1)

                    proposal_data_gen2 = {
                        "id": "proposal-sb-gen2",
                        "type": "generative",
                        "nodeType": "action-badge-image",
                        "nodeData": {
                            "id": NODE_ID_SB_GEN2,
                            "label": "Gen: Derivative Shot",
                        },
                        "groupId": NODE_ID_SB_GROUP,
                        "upstreamNodeId": shot1_img_id,
                        "autoRun": True,
                        "message": "I'll generate a derivative shot based on your result."
                    }
                    yield f"event: node_proposal\ndata: {json.dumps(proposal_data_gen2)}\n\n"
                    return

            # 10. Check SB Gen 2 -> Video (WAIT FOR GEN)
            if find_node_by_id(NODE_ID_SB_GEN2, context) and not find_node_by_id(NODE_ID_SB_VIDEO, context):
                shot2_img_id = find_output_image_id(NODE_ID_SB_GEN2, context)
                if not shot2_img_id:
                    yield f"event: text\ndata: {json.dumps({'agent': 'StoryboardArtist', 'content': 'Waiting for the derivative shot...'})}\n\n"
                    yield f"event: retry\ndata: {{}}\n\n"
                    return
                else:
                    yield f"event: thinking\ndata: {json.dumps({'content': 'Both shots ready. Let\'s animate them.'})}\n\n"
                    await asyncio.sleep(1)

                    shot1_img_id = find_output_image_id(NODE_ID_SB_GEN1, context)
                    upstream_ids = [shot1_img_id, shot2_img_id]

                    proposal_data_video = {
                        "id": "proposal-sb-video",
                        "type": "generative",
                        "nodeType": "action-badge-video",
                        "nodeData": {
                            "id": NODE_ID_SB_VIDEO,
                            "label": "Gen: Dynamic Storyboard",
                        },
                        "groupId": NODE_ID_SB_GROUP,
                        "upstreamNodeIds": upstream_ids,
                        "message": "Finally, I'll set up the video generation node using your shots."
                    }
                    yield f"event: node_proposal\ndata: {json.dumps(proposal_data_video)}\n\n"
                    return
            
            # 11. Final State
            if find_node_by_id(NODE_ID_SB_VIDEO, context):
                yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'Full demo scenario complete! Run the video generator to see the final result.'})}\n\n"
                yield f"event: end\ndata: {{}}\n\n"
                return

            # Fallback if no state matched (shouldn't happen if logic is complete)
            yield f"event: text\ndata: {json.dumps({'agent': 'Director', 'content': 'Workflow synced.'})}\n\n"
            yield f"event: retry\ndata: {{}}\n\n"

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
