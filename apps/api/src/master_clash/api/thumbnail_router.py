"""
Video thumbnail extraction API router.

Endpoints:
- POST /api/extract-thumbnail - Extract first frame from video and upload to R2
"""

import logging
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from master_clash.services import r2

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/extract-thumbnail", tags=["thumbnail"])


# === Models ===

class ExtractThumbnailRequest(BaseModel):
    """Request to extract video thumbnail."""
    video_r2_key: str = Field(..., description="R2 object key of the video")
    project_id: str = Field(..., description="Project ID")
    node_id: str = Field(..., description="Node ID")
    timestamp: float = Field(default=1.0, description="Timestamp to extract frame (seconds)")


class ExtractThumbnailResponse(BaseModel):
    """Response with thumbnail URL."""
    cover_r2_key: str = Field(..., description="R2 key for the thumbnail")
    cover_url: str = Field(..., description="Public URL for the thumbnail")


# === Thumbnail Extraction ===

async def extract_video_frame(video_data: bytes, timestamp: float = 1.0) -> bytes:
    """
    Extract a single frame from video at given timestamp using ffmpeg.

    Args:
        video_data: Video file bytes
        timestamp: Timestamp in seconds to extract frame

    Returns:
        JPEG image bytes
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        video_path = temp_path / "input.mp4"
        output_path = temp_path / "frame.jpg"

        # Write video to temp file
        video_path.write_bytes(video_data)

        # Extract frame using ffmpeg
        # -ss: seek to timestamp
        # -i: input file
        # -vframes 1: extract 1 frame
        # -q:v 2: JPEG quality (2 is high quality)
        # -update 1: allow single image output
        cmd = [
            "ffmpeg",
            "-ss", str(timestamp),
            "-i", str(video_path),
            "-vframes", "1",
            "-q:v", "2",
            "-update", "1",
            "-y",  # Overwrite output file
            str(output_path)
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                check=True
            )
            logger.info(f"[Thumbnail] ffmpeg output: {result.stderr[-500:]}")
        except subprocess.CalledProcessError as e:
            logger.error(f"[Thumbnail] ffmpeg failed: {e.stderr}")
            raise HTTPException(status_code=500, detail=f"ffmpeg failed: {e.stderr}")
        except subprocess.TimeoutExpired:
            logger.error("[Thumbnail] ffmpeg timeout")
            raise HTTPException(status_code=500, detail="ffmpeg timeout")

        if not output_path.exists():
            raise HTTPException(status_code=500, detail="Frame extraction failed - no output file")

        return output_path.read_bytes()


# === Endpoints ===

@router.post("", response_model=ExtractThumbnailResponse)
async def extract_thumbnail(request: ExtractThumbnailRequest):
    """
    Extract video thumbnail and upload to R2.

    The thumbnail will be stored with a consistent naming pattern:
    - Original video: projects/{projectId}/assets/video-{timestamp}-{uuid}.mp4
    - Thumbnail: projects/{projectId}/covers/video-{timestamp}-{uuid}.jpg
    """
    try:
        logger.info(f"[Thumbnail] Extracting from {request.video_r2_key}")

        # 1. Download video from R2
        video_data, metadata = await r2.fetch_object(request.video_r2_key)
        logger.info(f"[Thumbnail] Downloaded video: {len(video_data)} bytes")

        # 2. Extract frame at specified timestamp
        thumbnail_data = await extract_video_frame(video_data, request.timestamp)
        logger.info(f"[Thumbnail] Extracted frame: {len(thumbnail_data)} bytes")

        # 3. Generate cover R2 key
        # Convert: projects/{id}/assets/video-xxx.mp4 -> projects/{id}/covers/video-xxx.jpg
        video_key_path = Path(request.video_r2_key)
        video_filename = video_key_path.stem  # e.g., "video-1768742462211-_8242d477..."

        cover_r2_key = f"projects/{request.project_id}/covers/{video_filename}.jpg"

        # 4. Upload thumbnail to R2
        await r2.upload_object(
            key=cover_r2_key,
            data=thumbnail_data,
            content_type="image/jpeg"
        )
        logger.info(f"[Thumbnail] Uploaded to R2: {cover_r2_key}")

        # 5. Generate public URL (using Next.js API route pattern)
        cover_url = f"/api/assets/view/{cover_r2_key}"

        return ExtractThumbnailResponse(
            cover_r2_key=cover_r2_key,
            cover_url=cover_url
        )

    except Exception as e:
        logger.error(f"[Thumbnail] Extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
