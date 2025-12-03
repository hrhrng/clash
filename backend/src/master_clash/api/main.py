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
import uuid

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
    image_url: str | None = Field(default=None, description="Source image URL")
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
        

class StreamEmitter:
    """Helper class to emit formatted SSE events."""
    
    def format_event(self, event_type: str, data: dict) -> str:
        logger.info(f"Emitting event: {event_type} - {str(data)[:200]}...")
        return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

    def text(self, content: str, agent: str = "Director") -> str:
        """Output text token/message."""
        return self.format_event("text", {"agent": agent, "content": content})

    def thinking(self, content: str, agent: str = None, id: str = None) -> str:
        """Output thinking token/message."""
        data = {"content": content}
        if agent:
            data["agent"] = agent
        if id:
            data["id"] = id
        return self.format_event("thinking", data)

    def sub_agent_start(self, agent: str, task: str, id: str) -> str:
        logger.info(f"Sub-agent START: {agent} - {task} ({id})")
        return self.format_event("sub_agent_start", {"agent": agent, "task": task, "id": id})

    def sub_agent_end(self, agent: str, result: str, id: str) -> str:
        logger.info(f"Sub-agent END: {agent} - {result} ({id})")
        return self.format_event("sub_agent_end", {"agent": agent, "result": result, "id": id})

    async def tool_create_node(self, agent: str, tool_name: str, args: dict, proposal_data: dict, result_text: str):
        """Tool execution: Create Node."""
        tool_id = f"call_{uuid.uuid4().hex[:8]}"
        logger.info(f"Tool START: {agent} - {tool_name} ({tool_id})")
        yield self.format_event("tool_start", {"agent": agent, "tool_name": tool_name, "args": args, "id": tool_id})
        await asyncio.sleep(1) # Simulate work
        logger.info(f"Node Proposal: {proposal_data.get('id')}")
        yield self.format_event("node_proposal", proposal_data)
        logger.info(f"Tool END: {agent} - {result_text} ({tool_id})")
        yield self.format_event("tool_end", {"agent": agent, "result": result_text, "id": tool_id})

    async def tool_poll_asset(self, agent: str, node_id: str, context: ProjectContext, get_asset_id_func):
        """Tool execution: Poll Asset Status."""
        tool_id = f"call_{uuid.uuid4().hex[:8]}"
        logger.info(f"Tool Poll START: {agent} - {node_id} ({tool_id})")
        yield self.format_event("tool_start", {"agent": agent, "tool_name": "check_asset_status", "args": {"node_id": node_id}, "id": tool_id})
        
        asset_id = get_asset_id_func(node_id, context)
        if not asset_id:
            logger.info(f"Tool Poll RETRY: {node_id}")
            yield self.format_event("tool_end", {"agent": agent, "result": "Still generating...", "id": tool_id})
            yield self.format_event("retry", {})
            yield None # Signal not found
        else:
            logger.info(f"Tool Poll SUCCESS: {node_id} -> {asset_id}")
            yield self.format_event("tool_end", {"agent": agent, "result": f"Asset generated: {asset_id}", "id": tool_id})
            yield asset_id # Signal found


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
        nonlocal resume
        try:
            # Retrieve context
            context = _PROJECT_CONTEXTS.get(project_id)
            context_info = f"Context: {len(context.nodes)} nodes, {len(context.edges)} edges" if context else "Context: None"
            
            logger.info(f"Starting SSE stream for project: {project_id}, thread: {thread_id}, resume: {resume}, input: {user_input}. {context_info}")
            
            emitter = StreamEmitter()

            # --- Helper Functions ---
            def find_node_by_id(node_id: str, project_context: ProjectContext) -> NodeModel | None:
                if not project_context: return None
                for node in project_context.nodes:
                    if node.id == node_id:
                        return node
                return None

            def get_asset_id(node_id: str, project_context: ProjectContext) -> str | None:
                node = find_node_by_id(node_id, project_context)
                if node and node.data:
                    return node.data.get("assetId")
                return None

            # --- Deterministic IDs ---
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
                
                yield emitter.thinking("User wants a full demo scenario. I will start with the script, then concept art, then storyboard generation.")
                await asyncio.sleep(1)
    
                # ScriptWriter Sub-Agent
                sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                yield emitter.sub_agent_start("ScriptWriter", "Draft Script", sub_id)
                
                tool_id_script = "call_" + str(uuid.uuid4())[:8]
                yield emitter.format_event("tool_start", {"agent": "ScriptWriter", "tool_name": "write_script", "args": {"topic": "Cyberpunk Hacker Neo"}, "id": tool_id_script})
                await asyncio.sleep(2.0)
    
                script_content = "# Neo - The One\n\nA skilled hacker living a double life. By day, a software engineer; by night, a rebel searching for the truth."
                yield emitter.format_event("tool_end", {"agent": "ScriptWriter", "result": script_content, "id": tool_id_script})
                
                yield emitter.sub_agent_end("ScriptWriter", "Script Drafted", sub_id)
                await asyncio.sleep(0.5)
    
                # Director Proposes Script Node
                proposal_data_script = {
                    "id": "proposal-script-text",
                    "type": "simple",
                    "nodeType": "text",
                    "nodeData": {
                        "id": NODE_ID_SCRIPT,
                        "label": "Neo Script",
                        "content": script_content
                    },
                    "message": "Here is the drafted script. Shall I add it to the board?"
                }
                yield emitter.format_event("node_proposal", proposal_data_script)
                
                yield emitter.thinking("Waiting for you to accept the script...", agent="Director")
                
                # Wait for script node to appear
                for _ in range(120):
                    await asyncio.sleep(1)
                    current_context = _PROJECT_CONTEXTS.get(project_id)
                    if find_node_by_id(NODE_ID_SCRIPT, current_context):
                        yield emitter.thinking("Script accepted! Proceeding...", agent="Director")
                        resume = True
                        break
                
                if not resume:
                     yield emitter.thinking("Timed out waiting for script. Please accept it to continue.", agent="Director")
                     return

            if resume:
                # --- Resume Flow (Polling & Progression) ---
                # Refresh context
                context = _PROJECT_CONTEXTS.get(project_id)
                logger.info(f"Resuming flow. Checking state...")
    
                # 1. Check Script -> Concept Group
                logger.info("Step 1: Checking Script -> Concept Group")
                if find_node_by_id(NODE_ID_SCRIPT, context) and not find_node_by_id(NODE_ID_CONCEPT_GROUP, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("ConceptArtist", "Create Concept Group", sub_id)
                    
                    yield emitter.thinking("Script added. Now creating concept art group.", agent="ConceptArtist", id=sub_id)
                    await asyncio.sleep(1)
                    
                    proposal_data = {
                        "id": "proposal-concept-group",
                        "type": "group",
                        "nodeType": "group",
                        "nodeData": {"id": NODE_ID_CONCEPT_GROUP, "label": "Concept Art: Neo"},
                        "message": "I'll create a group for the concept art."
                    }
                    async for event in emitter.tool_create_node('ConceptArtist', 'create_group', {'label': 'Concept Art: Neo'}, proposal_data, 'Group: Concept Art: Neo'):
                        yield event
                    
                    yield emitter.sub_agent_end("ConceptArtist", "Group Created", sub_id)
                    return

                # 2. Check Concept Group -> Character Prompt
                logger.info("Step 2: Checking Concept Group -> Character Prompt")
                if find_node_by_id(NODE_ID_CONCEPT_GROUP, context) and not find_node_by_id(NODE_ID_CHAR_PROMPT, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("ConceptArtist", "Create Character Prompt", sub_id)
                    
                    yield emitter.thinking("Group ready. Extracting character prompt.", agent="ConceptArtist", id=sub_id)
                    await asyncio.sleep(1)
                    
                    char_prompt = "Cyberpunk hacker Neo, male, black trench coat, sunglasses, neon rain, high contrast, digital art, detailed face"
                    proposal_data = {
                        "id": "proposal-char-prompt",
                        "type": "simple",
                        "nodeType": "prompt",
                        "nodeData": {
                            "id": NODE_ID_CHAR_PROMPT,
                            "label": "Character Prompt",
                            "content": char_prompt
                        },
                        "groupId": NODE_ID_CONCEPT_GROUP,
                        "upstreamNodeId": NODE_ID_SCRIPT,
                        "message": "Here is the prompt for the character design."
                    }
                    async for event in emitter.tool_create_node('ConceptArtist', 'create_prompt', {'label': 'Character Prompt'}, proposal_data, char_prompt):
                        yield event
                    
                    yield emitter.sub_agent_end("ConceptArtist", "Prompt Created", sub_id)
                    return

                # 3. Check Character Prompt -> Character Gen
                logger.info("Step 3: Checking Character Prompt -> Character Gen")
                if find_node_by_id(NODE_ID_CHAR_PROMPT, context) and not find_node_by_id(NODE_ID_CHAR_GEN, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("ConceptArtist", "Create Character Gen Node", sub_id)
                    
                    proposal_data = {
                        "id": "proposal-char-gen",
                        "type": "generative",
                        "nodeType": "action-badge-image",
                        "nodeData": {"id": NODE_ID_CHAR_GEN, "label": "Gen: Character"},
                        "groupId": NODE_ID_CONCEPT_GROUP,
                        "upstreamNodeId": NODE_ID_CHAR_PROMPT,
                        "autoRun": True,
                        "message": "I'll add the generation node for the character."
                    }
                    async for event in emitter.tool_create_node('ConceptArtist', 'create_image_gen', {'label': 'Gen: Character'}, proposal_data, 'Generation Node: Character'):
                        yield event
                    
                    yield emitter.sub_agent_end("ConceptArtist", "Gen Node Created", sub_id)
                    return

                # 4. Check Character Gen -> Scene Prompt (WAIT FOR GEN)
                logger.info("Step 4: Checking Character Gen -> Scene Prompt")
                if find_node_by_id(NODE_ID_CHAR_GEN, context) and not find_node_by_id(NODE_ID_SCENE_PROMPT, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("ConceptArtist", "Poll Character Gen & Create Scene Prompt", sub_id)
                    
                    char_img_id = None
                    async for event in emitter.tool_poll_asset('ConceptArtist', NODE_ID_CHAR_GEN, context, get_asset_id):
                        if event is None:
                            continue
                        if event.startswith("event:"):
                            yield event
                        else:
                            char_img_id = event
                    
                    if not char_img_id:
                        # Don't end sub-agent if polling continues (retry)
                        # But wait, retry yields 'retry' event which frontend handles.
                        # We should probably not emit sub_agent_end here if we return early.
                        return

                    yield emitter.thinking("Character image found. Moving to scene creation.", agent="ConceptArtist", id=sub_id)
                    await asyncio.sleep(1)

                    scene_prompt = "Futuristic cyberpunk city street, night, neon lights, rain, wet pavement, towering skyscrapers, dystopian atmosphere"
                    proposal_data = {
                        "id": "proposal-scene-prompt",
                        "type": "simple",
                        "nodeType": "prompt",
                        "nodeData": {
                            "id": NODE_ID_SCENE_PROMPT,
                            "label": "Scene Prompt",
                            "content": scene_prompt
                        },
                        "groupId": NODE_ID_CONCEPT_GROUP,
                        "upstreamNodeId": NODE_ID_SCRIPT,
                        "message": "Great character! Now here is the prompt for the scene."
                    }
                    async for event in emitter.tool_create_node('ConceptArtist', 'create_prompt', {'label': 'Scene Prompt'}, proposal_data, scene_prompt):
                        yield event
                    
                    yield emitter.sub_agent_end("ConceptArtist", "Scene Prompt Created", sub_id)
                    return

                # 5. Check Scene Prompt -> Scene Gen
                logger.info("Step 5: Checking Scene Prompt -> Scene Gen")
                if find_node_by_id(NODE_ID_SCENE_PROMPT, context) and not find_node_by_id(NODE_ID_SCENE_GEN, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("ConceptArtist", "Create Scene Gen Node", sub_id)
                    
                    proposal_data = {
                        "id": "proposal-scene-gen",
                        "type": "generative",
                        "nodeType": "action-badge-image",
                        "nodeData": {"id": NODE_ID_SCENE_GEN, "label": "Gen: Scene"},
                        "groupId": NODE_ID_CONCEPT_GROUP,
                        "upstreamNodeId": NODE_ID_SCENE_PROMPT,
                        "autoRun": True,
                        "message": "I'll add the generation node for the scene."
                    }
                    async for event in emitter.tool_create_node('ConceptArtist', 'create_image_gen', {'label': 'Gen: Scene'}, proposal_data, 'Generation Node: Scene'):
                        yield event
                    
                    yield emitter.sub_agent_end("ConceptArtist", "Gen Node Created", sub_id)
                    return

                # 6. Check Scene Gen -> Storyboard Group (WAIT FOR GEN)
                logger.info("Step 6: Checking Scene Gen -> Storyboard Group")
                if find_node_by_id(NODE_ID_SCENE_GEN, context) and not find_node_by_id(NODE_ID_SB_GROUP, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("StoryboardArtist", "Poll Scene Gen & Create Storyboard Group", sub_id)
                    
                    scene_img_id = None
                    async for event in emitter.tool_poll_asset('ConceptArtist', NODE_ID_SCENE_GEN, context, get_asset_id):
                        if event is None:
                            continue
                        if event.startswith("event:"):
                            yield event
                        else:
                            scene_img_id = event
                    
                    if not scene_img_id: return

                    yield emitter.thinking("Scene ready. Setting up the storyboard.", agent="StoryboardArtist", id=sub_id)
                    await asyncio.sleep(1)

                    proposal_data = {
                        "id": "proposal-storyboard-group",
                        "type": "group",
                        "nodeType": "group",
                        "nodeData": {"id": NODE_ID_SB_GROUP, "label": "Storyboard: Act 1"},
                        "message": "I'll create a group for the storyboard."
                    }
                    async for event in emitter.tool_create_node('StoryboardArtist', 'create_group', {'label': 'Storyboard: Act 1'}, proposal_data, 'Group: Storyboard: Act 1'):
                        yield event
                    
                    yield emitter.sub_agent_end("StoryboardArtist", "Group Created", sub_id)
                    return

                # 7. Check Storyboard Group -> SB Prompt
                logger.info("Step 7: Checking Storyboard Group -> SB Prompt")
                if find_node_by_id(NODE_ID_SB_GROUP, context) and not find_node_by_id(NODE_ID_SB_PROMPT, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("StoryboardArtist", "Create Scene 1 Prompt", sub_id)
                    
                    sb_prompt1 = "Neo standing on a rooftop in the rain, looking at the neon city skyline."
                    proposal_data = {
                        "id": "proposal-sb-prompt",
                        "type": "simple",
                        "nodeType": "prompt",
                        "nodeData": {
                            "id": NODE_ID_SB_PROMPT,
                            "label": "Scene 1 Prompt",
                            "content": sb_prompt1
                        },
                        "groupId": NODE_ID_SB_GROUP,
                        "upstreamNodeId": NODE_ID_SCRIPT,
                        "message": "I've extracted the prompt for Scene 1."
                    }
                    async for event in emitter.tool_create_node('StoryboardArtist', 'create_prompt', {'label': 'Scene 1 Prompt'}, proposal_data, sb_prompt1):
                        yield event
                    
                    yield emitter.sub_agent_end("StoryboardArtist", "Prompt Created", sub_id)
                    return

                # 8. Check SB Prompt -> SB Gen 1
                logger.info("Step 8: Checking SB Prompt -> SB Gen 1")
                if find_node_by_id(NODE_ID_SB_PROMPT, context) and not find_node_by_id(NODE_ID_SB_GEN1, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("StoryboardArtist", "Create Static Shot 1 Gen Node", sub_id)
                    
                    char_img_id = get_asset_id(NODE_ID_CHAR_GEN, context)
                    scene_img_id = get_asset_id(NODE_ID_SCENE_GEN, context)
                    upstream_ids = [NODE_ID_SB_PROMPT]
                    if char_img_id: upstream_ids.append(char_img_id)
                    if scene_img_id: upstream_ids.append(scene_img_id)

                    proposal_data = {
                        "id": "proposal-sb-gen1",
                        "type": "generative",
                        "nodeType": "action-badge-image",
                        "nodeData": {"id": NODE_ID_SB_GEN1, "label": "Gen: Static Shot 1"},
                        "groupId": NODE_ID_SB_GROUP,
                        "upstreamNodeIds": upstream_ids,
                        "autoRun": True,
                        "message": "I'll set up the generation node, using the prompt and your concept art."
                    }
                    async for event in emitter.tool_create_node('StoryboardArtist', 'create_image_gen', {'label': 'Gen: Static Shot 1'}, proposal_data, 'Generation Node: Static Shot 1'):
                        yield event
                    
                    yield emitter.sub_agent_end("StoryboardArtist", "Gen Node Created", sub_id)
                    return

                # 9. Check SB Gen 1 -> SB Prompt 2 (WAIT FOR GEN 1)
                NODE_ID_SB_PROMPT2 = "sb-prompt-2"
                logger.info("Step 9: Checking SB Gen 1 -> SB Prompt 2")
                if find_node_by_id(NODE_ID_SB_GEN1, context) and not find_node_by_id(NODE_ID_SB_PROMPT2, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("StoryboardArtist", "Poll Shot 1 & Create Close-up Prompt", sub_id)
                    
                    shot1_img_id = None
                    async for event in emitter.tool_poll_asset('StoryboardArtist', NODE_ID_SB_GEN1, context, get_asset_id):
                        if event is None:
                            continue
                        if event.startswith("event:"):
                            yield event
                        else:
                            shot1_img_id = event
                    
                    if not shot1_img_id: return

                    yield emitter.thinking("Shot 1 captured. Now drafting the prompt for the close-up.", agent="StoryboardArtist", id=sub_id)
                    await asyncio.sleep(1)

                    sb_prompt2 = "Extreme close-up of Neo's sunglasses reflecting the neon city lights, rain dripping down the lens."
                    proposal_data = {
                        "id": "proposal-sb-prompt2",
                        "type": "simple",
                        "nodeType": "prompt",
                        "nodeData": {
                            "id": NODE_ID_SB_PROMPT2,
                            "label": "Scene 1 Close-up",
                            "content": sb_prompt2
                        },
                        "groupId": NODE_ID_SB_GROUP,
                        "upstreamNodeId": shot1_img_id,
                        "message": "Here is the prompt for the derivative shot (close-up)."
                    }
                    async for event in emitter.tool_create_node('StoryboardArtist', 'create_prompt', {'label': 'Scene 1 Close-up'}, proposal_data, sb_prompt2):
                        yield event
                    
                    yield emitter.sub_agent_end("StoryboardArtist", "Prompt Created", sub_id)
                    return

                # 10. Check SB Prompt 2 -> SB Gen 2
                logger.info("Step 10: Checking SB Prompt 2 -> SB Gen 2")
                if find_node_by_id(NODE_ID_SB_PROMPT2, context) and not find_node_by_id(NODE_ID_SB_GEN2, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("StoryboardArtist", "Create Derivative Shot Gen Node", sub_id)
                    
                    shot1_img_id = get_asset_id(NODE_ID_SB_GEN1, context)
                    upstream_ids = [NODE_ID_SB_PROMPT2]
                    if shot1_img_id: upstream_ids.append(shot1_img_id)

                    proposal_data = {
                        "id": "proposal-sb-gen2",
                        "type": "generative",
                        "nodeType": "action-badge-image",
                        "nodeData": {"id": NODE_ID_SB_GEN2, "label": "Gen: Derivative Shot"},
                        "groupId": NODE_ID_SB_GROUP,
                        "upstreamNodeIds": upstream_ids,
                        "autoRun": True,
                        "message": "I'll generate the derivative shot using the prompt and the previous image."
                    }
                    async for event in emitter.tool_create_node('StoryboardArtist', 'create_image_gen', {'label': 'Gen: Derivative Shot'}, proposal_data, 'Generation node added.'):
                        yield event
                    
                    yield emitter.sub_agent_end("StoryboardArtist", "Gen Node Created", sub_id)
                    return

                # 11. Check SB Gen 2 -> Video (WAIT FOR GEN)
                logger.info("Step 11: Checking SB Gen 2 -> Video")
                if find_node_by_id(NODE_ID_SB_GEN2, context) and not find_node_by_id(NODE_ID_SB_VIDEO, context):
                    sub_id = f"sub_{uuid.uuid4().hex[:8]}"
                    yield emitter.sub_agent_start("StoryboardArtist", "Poll Shot 2 & Create Video Gen Node", sub_id)
                    
                    shot2_img_id = None
                    async for event in emitter.tool_poll_asset('StoryboardArtist', NODE_ID_SB_GEN2, context, get_asset_id):
                        if event is None:
                            continue
                        if event.startswith("event:"):
                            yield event
                        else:
                            shot2_img_id = event
                    
                    if not shot2_img_id: return

                    yield emitter.thinking("Both shots ready. Let's animate them.", agent="StoryboardArtist", id=sub_id)
                    await asyncio.sleep(1)

                    shot1_img_id = get_asset_id(NODE_ID_SB_GEN1, context)
                    upstream_ids = [shot1_img_id, shot2_img_id]

                    proposal_data = {
                        "id": "proposal-sb-video",
                        "type": "generative",
                        "nodeType": "action-badge-video",
                        "nodeData": {"id": NODE_ID_SB_VIDEO, "label": "Gen: Dynamic Storyboard"},
                        "groupId": NODE_ID_SB_GROUP,
                        "upstreamNodeIds": upstream_ids,
                        "message": "Finally, I'll set up the video generation node using your shots."
                    }
                    async for event in emitter.tool_create_node('StoryboardArtist', 'create_video_gen', {'label': 'Gen: Dynamic Storyboard'}, proposal_data, 'Generation node added.'):
                        yield event
                    
                    yield emitter.sub_agent_end("StoryboardArtist", "Gen Node Created", sub_id)
                    return
                
                # 12. Final State
                if find_node_by_id(NODE_ID_SB_VIDEO, context):
                    yield emitter.text("Full demo scenario complete! Run the video generator to see the final result.", agent="Director")
                    yield f"event: end\ndata: {{}}\n\n"
                    return
    
                # Fallback
                yield emitter.thinking("Workflow synced.", agent="Director")
                yield f"event: retry\ndata: {{}}\n\n"
    
        except Exception as e:
            import traceback
            logger.error(f"SSE Stream Error: {e}")
            logger.error(traceback.format_exc())
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

        logger.info(f"SSE stream finished for project: {project_id}")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


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
