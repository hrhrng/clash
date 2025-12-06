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
from master_clash.tools.kling_video import kling_video_gen
from master_clash.tools.description import generate_description
from master_clash.context import ProjectContext, NodeModel, EdgeModel, _PROJECT_CONTEXTS, set_project_context, get_project_context
from master_clash.workflow.multi_agent import graph
# from master_clash.video_analysis import VideoAnalysisOrchestrator, VideoAnalysisConfig, VideoAnalysisResult
from langchain_core.messages import HumanMessage
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


class GenerateSemanticIDRequest(BaseModel):
    """Request to generate semantic IDs."""
    project_id: str = Field(..., description="Project ID for scoping")
    count: int = Field(default=1, ge=1, le=100, description="Number of IDs to generate")


class GenerateSemanticIDResponse(BaseModel):
    """Response with generated semantic IDs."""
    ids: list[str] = Field(..., description="List of generated semantic IDs")
    project_id: str = Field(..., description="Project ID")


class GenerateDescriptionResponse(BaseModel):
    """Response with generated description."""
    task_id: str = Field(..., description="Task ID")
    status: str = Field(default="processing", description="Task status")


class AnalyzeVideoRequest(BaseModel):
    """Request to analyze a video comprehensively."""
    video_path: str = Field(..., description="Path to video file")
    output_dir: str | None = Field(default=None, description="Output directory for analysis results")

    # Analysis options
    enable_asr: bool = Field(default=True, description="Enable audio transcription")
    enable_subtitle_extraction: bool = Field(default=True, description="Extract embedded subtitles")
    enable_keyframe_detection: bool = Field(default=True, description="Detect key frames")
    enable_gemini_analysis: bool = Field(default=True, description="Enable Gemini video understanding")

    # ASR config
    asr_language: str = Field(default="auto", description="Language for ASR (auto-detect or ISO code)")

    # Keyframe config
    keyframe_threshold: float = Field(default=0.3, description="Scene change threshold (0-1)")
    max_keyframes: int = Field(default=50, description="Maximum number of keyframes")

    # Gemini config
    gemini_model: str = Field(default="gemini-2.5-pro", description="Gemini model to use")
    gemini_prompt: str | None = Field(default=None, description="Custom analysis prompt")

    callback_url: str | None = Field(default=None, description="Callback URL for completion")


class AnalyzeVideoResponse(BaseModel):
    """Response for video analysis task."""
    task_id: str = Field(..., description="Task ID for polling")
    status: str = Field(default="processing", description="Initial status")
    message: str = Field(default="Video analysis started", description="Status message")


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
# Imported from master_clash.context


@app.post("/api/v1/project/{project_id}/context")
async def update_project_context(project_id: str, context: ProjectContext):
    """
    Update the context (nodes and edges) for a specific project.
    This allows the backend to be aware of the current frontend state.
    """
    logger.info(f"Received context update for project {project_id}")
    logger.info(f"Nodes: {len(context.nodes)}, Edges: {len(context.edges)}")
    set_project_context(project_id, context)
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

    def end(self) -> str:
        """Output end token."""
        return self.format_event("end", {})

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
    """Stream LangGraph workflow events as SSE using LangGraph streaming modes."""
    emitter = StreamEmitter()

    if not resume and not user_input:
        raise HTTPException(status_code=400, detail="user_input is required when starting a new run")

    def _extract_text(content: Any) -> str:
        if content is None:
            return ""
        if isinstance(content, list):
            return "".join(part.get("text", "") for part in content if isinstance(part, dict))
        return str(content)

    async def event_stream():
        inputs = None
        if not resume:
            message = f"Project ID: {project_id}. {user_input}"
            inputs = {
                "messages": [HumanMessage(content=message)],
                "project_id": project_id,
                "next": "Supervisor"
            }

        config = {"configurable": {"thread_id": thread_id}}
        stream_modes = ["messages", "custom"]  # Only messages and custom modes
        emitted_tool_ids = set()
        tool_id_to_name = {}  # Cache tool_call_id -> tool_name mapping
        tool_call_to_agent = {}  # Cache task_delegation tool_call_id -> target_agent_name mapping
        namespace_to_agent = {}  # Cache namespace (first element) -> agent_name mapping
        current_delegation_agent = None  # Track the currently active delegated agent

        try:
            async for streamed in graph.astream(
                inputs,
                config=config,
                stream_mode=stream_modes,
                subgraphs=True,  # surface subgraph/custom events from nested calls
            ):
                namespace = []
                mode = None
                payload = streamed

                # Format is [namespace, mode, data] where namespace is a list
                if isinstance(streamed, (list, tuple)) and len(streamed) == 3:
                    namespace, mode, payload = streamed
                    logger.debug(f"Stream: namespace={namespace}, mode={mode}")
                else:
                    logger.warning(f"Unexpected stream format: type={type(streamed)}, len={len(streamed) if hasattr(streamed, '__len__') else 'N/A'}")

                if mode == "messages":
                    # Payload is a list: [msg_chunk_dict, metadata_dict]
                    if not isinstance(payload, (list, tuple)) or len(payload) != 2:
                        continue

                    msg_chunk_dict, metadata = payload

                    # Debug: Log metadata structure (only when there's a namespace or specific conditions)
                    if namespace:
                        logger.info(f"[STREAM DEBUG] mode=messages, namespace={namespace}")
                        if isinstance(metadata, dict):
                            logger.info(f"[STREAM DEBUG] langgraph_node={metadata.get('langgraph_node')}")
                            logger.info(f"[STREAM DEBUG] langgraph_triggers={metadata.get('langgraph_triggers')}")
                            logger.info(f"[STREAM DEBUG] langgraph_path={metadata.get('langgraph_path')}")

                    agent_name = metadata.get("langgraph_node") if isinstance(metadata, dict) else None

                    # If this is the root graph (empty namespace) and node is 'agent', it's the Director
                    if not namespace and agent_name == "agent":
                        logger.info(f"[AGENT_NAME] Root graph agent -> Director")
                        agent_name = "Director"
                    # Handle sub-graph: resolve agent name from task_delegation mapping
                    elif namespace:
                        # The namespace format is like: ('tools:UUID',) or ('tools:UUID', '1')
                        # We use a simple strategy: assume the most recent task_delegation is the current sub-agent
                        ns_first = namespace[0] if namespace and isinstance(namespace[0], str) else None

                        # Check if we've already cached this namespace
                        if ns_first and ns_first in namespace_to_agent:
                            agent_name = namespace_to_agent[ns_first]
                            logger.info(f"[AGENT_NAME] Resolved from cache: {ns_first} -> {agent_name}")
                        elif ns_first and current_delegation_agent:
                            # Cache this namespace to the current delegated agent
                            namespace_to_agent[ns_first] = current_delegation_agent
                            agent_name = current_delegation_agent
                            logger.info(f"[AGENT_NAME] New namespace {ns_first} -> {current_delegation_agent}")
                        else:
                            logger.debug(f"[NAMESPACE] No mapping for namespace: {namespace}, current_delegation={current_delegation_agent}")

                    # Handle tool calls
                    tool_calls = []
                    if isinstance(msg_chunk_dict, dict):
                        kwargs = msg_chunk_dict.get("kwargs", {})
                        if isinstance(kwargs, dict):
                            tool_calls = kwargs.get("tool_calls", [])
                    else:
                        tool_calls = getattr(msg_chunk_dict, "tool_calls", [])

                    if tool_calls:
                        for tool_call in tool_calls:
                            # Handle both dict and object tool calls
                            if isinstance(tool_call, dict):
                                tool_name = tool_call.get("name")
                                tool_args = tool_call.get("args", {})
                                tool_id = tool_call.get("id")
                            else:
                                tool_name = getattr(tool_call, "name", None)
                                tool_args = getattr(tool_call, "args", {})
                                tool_id = getattr(tool_call, "id", None)

                            if tool_name and tool_id and tool_id not in emitted_tool_ids:
                                # Debug: Log tool_start
                                logger.info(f"[TOOL_START DEBUG] tool={tool_name}, id={tool_id}, agent={agent_name}")
                                logger.info(f"[TOOL_START DEBUG] namespace={namespace}")

                                emitted_tool_ids.add(tool_id)
                                tool_id_to_name[tool_id] = tool_name  # Cache tool name mapping

                                # If this is task_delegation, cache the target agent mapping
                                if tool_name == "task_delegation" and isinstance(tool_args, dict):
                                    target_agent = tool_args.get("agent")
                                    if target_agent:
                                        tool_call_to_agent[tool_id] = target_agent
                                        current_delegation_agent = target_agent  # Track active delegation
                                        logger.info(f"[MAPPING] Cached: {tool_id} -> {target_agent}")
                                        logger.info(f"[MAPPING] Set current_delegation_agent = {target_agent}")
                                        logger.info(f"[TOOL_START DEBUG] task_delegation args: {tool_args}")
                                        logger.info(f"[TOOL_START DEBUG] target_agent: {target_agent}")

                                yield emitter.format_event("tool_start", {
                                    "tool": tool_name,
                                    "input": tool_args,
                                    "agent": agent_name or "Agent"
                                })

                    # Handle tool outputs (ToolMessage)
                    if isinstance(msg_chunk_dict, dict):
                        msg_type = msg_chunk_dict.get("type")
                        tool_call_id = msg_chunk_dict.get("tool_call_id")
                        content = msg_chunk_dict.get("content", "")
                        # Debug: Log ToolMessage checking
                        logger.info(f"[TOOL_END DEBUG] Checking dict - type={msg_type}, tool_call_id={tool_call_id}")
                    else:
                        msg_type = getattr(msg_chunk_dict, "type", None)
                        tool_call_id = getattr(msg_chunk_dict, "tool_call_id", None)
                        content = getattr(msg_chunk_dict, "content", "")
                        # Debug: Log ToolMessage checking
                        logger.info(f"[TOOL_END DEBUG] Checking obj - type={msg_type}, tool_call_id={tool_call_id}")
                        logger.info(f"[TOOL_END DEBUG] Object type: {type(msg_chunk_dict).__name__}")

                    if msg_type == "tool" and tool_call_id:
                        # Get tool name from cache instead of from ToolMessage
                        tool_name = tool_id_to_name.get(tool_call_id, "unknown")

                        # For tool_end, we need to determine the correct agent
                        # If this is a task_delegation tool_end, the agent should be Director (the one who called it)
                        # Otherwise, use the resolved agent_name from namespace
                        tool_end_agent = agent_name
                        if tool_name == "task_delegation":
                            # task_delegation is always called by Director
                            tool_end_agent = "Director"
                        elif not namespace:
                            # Root graph, should be Director
                            tool_end_agent = "Director"
                        # else: use the resolved agent_name from namespace (sub-agent)

                        logger.info(f"[TOOL_END] Emitting tool_end: id={tool_call_id}, tool={tool_name}, agent={tool_end_agent}")

                        # Reset current_delegation_agent when task_delegation completes
                        if tool_name == "task_delegation":
                            logger.info(f"[MAPPING] Clearing current_delegation_agent (was {current_delegation_agent})")
                            current_delegation_agent = None

                        yield emitter.format_event("tool_end", {
                            "id": tool_call_id,
                            "tool": tool_name,  # Use cached tool name
                            "result": content,
                            "agent": tool_end_agent or "Agent"
                        })
                        continue
                    else:
                        # Debug: Log cases where tool_end is not emitted
                        if msg_type == "tool":
                            logger.warning(f"[TOOL_END] ToolMessage without tool_call_id: {msg_chunk_dict}")
                        if tool_call_id and msg_type != "tool":
                            logger.warning(f"[TOOL_END] Has tool_call_id but type is not 'tool': type={msg_type}, id={tool_call_id}")

                    # Extract content from the message chunk dict
                    if isinstance(msg_chunk_dict, dict):
                        kwargs = msg_chunk_dict.get("kwargs", {})
                        if isinstance(kwargs, dict):
                            content = kwargs.get("content", [])
                        else:
                            content = []
                    else:
                        content = getattr(msg_chunk_dict, "content", None)

                    logger.debug(
                        "stream messages chunk agent=%s content_preview=%s",
                        agent_name or "Agent",
                        repr(content)[:200] if content else "None",
                    )

                    # Handle list-style content parts (e.g., [{"type": "text", "text": "..."}])
                    if isinstance(content, list):
                        for part in content:
                            if not isinstance(part, dict):
                                continue
                            part_type = part.get("type")

                            # Handle thinking blocks
                            if part_type == "thinking":
                                thinking_text = part.get("thinking", "")
                                if thinking_text:
                                    logger.info(f"[THINKING] Sending thinking with agent={agent_name}, namespace={namespace}")
                                    yield emitter.thinking(thinking_text, agent=agent_name or "Agent")
                            # Handle text blocks
                            elif part_type == "text":
                                part_text = part.get("text", "")
                                if part_text:
                                    yield emitter.text(part_text, agent=agent_name or "Agent")
                        continue

                    # Fallback for non-list content
                    text_content = _extract_text(content)
                    if text_content:
                        yield emitter.text(text_content, agent=agent_name or "Agent")

                elif mode == "custom":
                    data = payload
                    if isinstance(data, dict):
                        action = data.get("action")
                        if action == "create_node_proposal" and data.get("proposal"):
                            yield emitter.format_event("node_proposal", data["proposal"])
                            continue
                        if action == "timeline_edit":
                            yield emitter.format_event("timeline_edit", data)
                            continue
                        yield emitter.format_event("custom", data)

        except Exception as exc:  # pragma: no cover - surfaced to client
            logger.error("Stream workflow failed: %s", exc, exc_info=True)
            yield emitter.format_event("workflow_error", {"message": str(exc)})
            yield emitter.end()

        # Always end the stream
        yield emitter.end()

    return StreamingResponse(event_stream(), media_type="text/event-stream")

def process_video_analysis(task_id: str, request_data: dict, callback_url: str = None):
    """Background task to run comprehensive video analysis."""
    # try:
    #     logger.info(f"Starting video analysis for task {task_id}")

    #     # Create config from request
    #     # config = VideoAnalysisConfig(
    #     #     enable_asr=request_data.get("enable_asr", True),
    #     #     enable_subtitle_extraction=request_data.get("enable_subtitle_extraction", True),
    #     #     enable_keyframe_detection=request_data.get("enable_keyframe_detection", True),
    #     #     enable_gemini_analysis=request_data.get("enable_gemini_analysis", True),
    #     #     asr_language=request_data.get("asr_language", "auto"),
    #     #     keyframe_threshold=request_data.get("keyframe_threshold", 0.3),
    #     #     max_keyframes=request_data.get("max_keyframes", 50),
    #     #     gemini_model=request_data.get("gemini_model", "gemini-2.5-pro"),
    #     #     gemini_prompt=request_data.get("gemini_prompt"),
    #     # )

    #     # Create orchestrator
    #     # orchestrator = VideoAnalysisOrchestrator(config)

    #     # Run analysis (sync wrapper for async)
    #     loop = asyncio.new_event_loop()
    #     asyncio.set_event_loop(loop)
    #     try:
    #         result = loop.run_until_complete(
    #             orchestrator.analyze_video(
    #                 request_data["video_path"],
    #                 request_data.get("output_dir")
    #             )
    #         )
    #     finally:
    #         loop.close()

    #     # Convert result to dict
    #     result_dict = result.model_dump()

    #     logger.info(f"Video analysis completed for task {task_id}")

    #     # Send result via callback
    #     if callback_url:
    #         try:
    #             response = requests.post(
    #                 callback_url,
    #                 json={
    #                     "taskId": task_id,
    #                     "status": "completed",
    #                     "result": result_dict
    #                 }
    #             )
    #             if response.ok:
    #                 logger.info(f"Callback successful for task {task_id}")
    #             else:
    #                 logger.error(f"Callback failed: {response.status_code} - {response.text}")
    #         except Exception as e:
    #             logger.error(f"Failed to send callback: {e}")

    # except Exception as e:
    #     import traceback
    #     logger.error(f"Video analysis failed for task {task_id}: {e}")
    #     logger.debug(traceback.format_exc())

    #     # Send error via callback
    #     if callback_url:
    #         try:
    #             requests.post(
    #                 callback_url,
    #                 json={
    #                     "taskId": task_id,
    #                     "status": "failed",
    #                     "error": str(e)
    #                 }
    #             )
    #         except Exception as callback_error:
    #             logger.error(f"Failed to send error callback: {callback_error}")


@app.post("/api/analyze-video", response_model=AnalyzeVideoResponse)
async def analyze_video(request: AnalyzeVideoRequest, background_tasks: BackgroundTasks):
    """
    Comprehensive video analysis including:
    - ASR (audio transcription)
    - Subtitle extraction
    - Keyframe detection
    - Gemini video understanding

    Returns task_id immediately - use callback_url for completion notification.
    """
    task_id = str(uuid.uuid4())

    logger.info(f"Received video analysis request for: {request.video_path}")

    # Validate video file exists
    from pathlib import Path
    if not Path(request.video_path).exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {request.video_path}")

    # Prepare request data
    request_data = {
        "video_path": request.video_path,
        "output_dir": request.output_dir,
        "enable_asr": request.enable_asr,
        "enable_subtitle_extraction": request.enable_subtitle_extraction,
        "enable_keyframe_detection": request.enable_keyframe_detection,
        "enable_gemini_analysis": request.enable_gemini_analysis,
        "asr_language": request.asr_language,
        "keyframe_threshold": request.keyframe_threshold,
        "max_keyframes": request.max_keyframes,
        "gemini_model": request.gemini_model,
        "gemini_prompt": request.gemini_prompt,
    }

    # Start background task
    background_tasks.add_task(
        process_video_analysis,
        task_id,
        request_data,
        request.callback_url
    )

    return AnalyzeVideoResponse(
        task_id=task_id,
        status="processing",
        message="Video analysis started in background"
    )


@app.post("/api/generate-ids", response_model=GenerateSemanticIDResponse)
async def generate_semantic_ids(request: GenerateSemanticIDRequest):
    """Generate semantic IDs for a project.

    Returns human-readable, memorable IDs like "alpha-ocean-square"
    that are unique within the project scope.
    """
    try:
        from master_clash.semantic_id import create_d1_checker, generate_unique_ids_for_project

        # Create D1 checker
        checker = create_d1_checker()

        # Generate unique IDs
        ids = generate_unique_ids_for_project(
            request.project_id,
            request.count,
            checker
        )

        return GenerateSemanticIDResponse(
            ids=ids,
            project_id=request.project_id
        )

    except Exception as e:
        logger.error(f"Error generating semantic IDs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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
