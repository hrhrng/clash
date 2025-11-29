"""
FastAPI server for Master Clash backend.
Handles AI generation - returns base64 images or temporary URLs.
Frontend handles storage and database.
"""
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from master_clash.config import get_settings
from master_clash.tools.nano_banana import nano_banana_gen
from master_clash.tools.kling_video import kling_video_gen


# Request/Response Models
class GenerateImageRequest(BaseModel):
    """Request to generate image using Nano Banana."""
    prompt: str = Field(..., description="Image generation prompt")
    system_prompt: str = Field(default="", description="System-level instructions")
    aspect_ratio: str = Field(default="16:9", description="Image aspect ratio")


class GenerateImageResponse(BaseModel):
    """Response with base64 encoded image."""
    base64: str = Field(..., description="Base64 encoded image data")
    model: str = Field(default="gemini-2.5-flash-image", description="Model used")


class GenerateVideoRequest(BaseModel):
    """Request to generate video using Kling."""
    image_url: str = Field(..., description="URL or path to input image")
    prompt: str = Field(..., description="Video generation prompt")
    duration: int = Field(default=5, description="Video duration in seconds (5 or 10)")
    cfg_scale: float = Field(default=0.5, description="Guidance scale (0-1)")
    model: str = Field(default="kling-v1", description="Kling model version")


class GenerateVideoResponse(BaseModel):
    """Response with temporary video URL from Kling."""
    url: str = Field(..., description="Temporary Kling video URL")
    duration: int = Field(..., description="Video duration in seconds")
    model: str = Field(..., description="Model used")


class WorkflowStatusResponse(BaseModel):
    """Workflow execution status."""
    project_id: str
    status: str  # "running", "completed", "failed"
    progress: float  # 0.0 to 1.0
    current_step: str
    result: dict[str, Any] | None = None
    error: str | None = None


# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events."""
    # Startup
    settings = get_settings()
    app.state.settings = settings

    # TODO: Initialize database connection pool
    # TODO: Initialize LangGraph checkpointer

    yield

    # Shutdown
    # TODO: Close database connections
    pass


# Create FastAPI app
app = FastAPI(
    title="Master Clash API",
    description="AI-powered video production backend",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Master Clash API",
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint for container orchestration."""
    return {"status": "healthy"}


@app.post("/api/generate/image", response_model=GenerateImageResponse)
async def generate_image(request: GenerateImageRequest):
    """
    Generate image using Nano Banana (Google Gemini).
    Returns base64 encoded image - frontend handles storage.
    """
    try:
        base64_image = nano_banana_gen(
            text=request.prompt,
            system_prompt=request.system_prompt,
            base64_images=[],
            aspect_ratio=request.aspect_ratio,
        )

        return GenerateImageResponse(
            base64=base64_image,
            model="gemini-2.5-flash-image"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")


@app.post("/api/generate/video", response_model=GenerateVideoResponse)
async def generate_video(request: GenerateVideoRequest):
    """
    Generate video using Kling (image-to-video).
    Returns temporary Kling URL - frontend handles download and storage.
    """
    try:
        video_url = kling_video_gen(
            image_path=request.image_url,
            prompt=request.prompt,
            duration=request.duration,
            cfg_scale=request.cfg_scale,
            model=request.model,
        )

        return GenerateVideoResponse(
            url=video_url,
            duration=request.duration,
            model=request.model
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Video generation failed: {str(e)}")


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


@app.post("/api/v1/workflow/{project_id}/cancel")
async def cancel_workflow(project_id: str):
    """Cancel a running workflow."""
    try:
        # TODO: Interrupt workflow execution

        return {"project_id": project_id, "status": "cancelled"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler."""
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": type(exc).__name__}
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
