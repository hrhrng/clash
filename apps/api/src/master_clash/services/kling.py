"""
Kling Video Generation Service.

Handles video generation via Kling AI API.
Using Beijing region (api-beijing.klingai.com).
"""

import logging
import time
import hashlib
import hmac
import base64
import httpx

from master_clash.config import get_settings
from master_clash.json_utils import dumps as json_dumps
from master_clash.services import r2

settings = get_settings()

logger = logging.getLogger(__name__)

# Kling API endpoints (using Beijing region)
KLING_API_BASE = "https://api-beijing.klingai.com"
SUBMIT_ENDPOINT = f"{KLING_API_BASE}/v1/videos/image2video"
QUERY_ENDPOINT = f"{KLING_API_BASE}/v1/videos/image2video"


def _generate_jwt() -> str:
    """Generate JWT for Kling API authentication."""
    access_key = settings.KLING_ACCESS_KEY
    secret_key = settings.KLING_SECRET_KEY
    
    if not access_key or not secret_key:
        raise ValueError("KLING_ACCESS_KEY and KLING_SECRET_KEY required")
    
    # JWT header
    header = {"alg": "HS256", "typ": "JWT"}
    
    # JWT payload
    now = int(time.time())
    payload = {
        "iss": access_key,
        "exp": now + 1800,  # 30 minutes
        "nbf": now - 5,
    }
    
    def base64url_encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')
    
    header_b64 = base64url_encode(json_dumps(header).encode())
    payload_b64 = base64url_encode(json_dumps(payload).encode())
    
    signature_input = f"{header_b64}.{payload_b64}"
    signature = hmac.new(
        secret_key.encode(),
        signature_input.encode(),
        hashlib.sha256
    ).digest()
    signature_b64 = base64url_encode(signature)
    
    return f"{header_b64}.{payload_b64}.{signature_b64}"


async def submit_video(
    prompt: str,
    image_r2_key: str,
    duration: int = 5,
    model: str = "kling-v1",
) -> dict:
    """
    Submit video generation to Kling.
    
    Args:
        prompt: Text prompt for video
        image_r2_key: R2 key of source image
        duration: Video duration in seconds
        model: Kling model version
        
    Returns:
        {"success": True, "external_task_id": "..."} or
        {"success": False, "error": "..."}
    """
    logger.info(f"[Kling] Submitting video: {prompt[:50]}...")
    
    try:
        # Fetch image from R2
        image_data, content_type = await r2.fetch_object(image_r2_key)
        
        # Convert to base64
        image_base64 = base64.b64encode(image_data).decode('utf-8')
        
        # Build request
        jwt_token = _generate_jwt()
        
        request_body = {
            "model_name": model,
            "prompt": prompt,
            "image": image_base64,
            "duration": str(duration),
            "cfg_scale": 0.5,
            "mode": "std",
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                SUBMIT_ENDPOINT,
                headers={
                    "Authorization": f"Bearer {jwt_token}",
                    "Content-Type": "application/json",
                },
                json=request_body,
            )
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f"[Kling] Submit failed: {response.status_code} - {error_text}")
                return {"success": False, "error": f"API error {response.status_code}: {error_text}"}
            
            result = response.json()
            
            if result.get("code") != 0:
                return {"success": False, "error": result.get("message", "Unknown error")}
            
            task_id = result.get("data", {}).get("task_id")
            if not task_id:
                return {"success": False, "error": "No task_id in response"}
            
            logger.info(f"[Kling] Video submitted: {task_id}")
            return {"success": True, "external_task_id": task_id}
            
    except Exception as e:
        logger.error(f"[Kling] Submit error: {e}")
        return {"success": False, "error": str(e)}


async def poll_video(external_task_id: str, project_id: str = "unknown") -> dict:
    """
    Poll Kling for video completion.
    
    Args:
        external_task_id: Kling task ID
        project_id: Project ID for R2 upload
        
    Returns:
        {"status": "pending/completed/failed", "r2_key": "...", "error": "..."}
    """
    logger.info(f"[Kling] Polling: {external_task_id}")
    
    try:
        jwt_token = _generate_jwt()
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{QUERY_ENDPOINT}/{external_task_id}",
                headers={"Authorization": f"Bearer {jwt_token}"},
            )
            
            if response.status_code != 200:
                return {"status": "failed", "error": f"Poll error: {response.status_code}"}
            
            result = response.json()
            
            if result.get("code") != 0:
                return {"status": "failed", "error": result.get("message", "Unknown error")}
            
            data = result.get("data", {})
            task_status = data.get("task_status")
            
            if task_status == "succeed":
                # Get video URL
                videos = data.get("task_result", {}).get("videos", [])
                if not videos:
                    return {"status": "failed", "error": "No video in result"}
                
                video_url = videos[0].get("url")
                if not video_url:
                    return {"status": "failed", "error": "No video URL"}
                
                # Download and upload to R2
                logger.info(f"[Kling] Downloading video from {video_url[:50]}...")
                video_response = await client.get(video_url)
                if video_response.status_code != 200:
                    return {"status": "failed", "error": f"Download failed: {video_response.status_code}"}
                
                video_data = video_response.content
                r2_key = f"projects/{project_id}/generated/vid_{external_task_id}.mp4"
                
                logger.info(f"[Kling] Uploading to R2: {r2_key}")
                await r2.put_object(r2_key, video_data, "video/mp4")
                
                return {"status": "completed", "r2_key": r2_key}
                
            elif task_status == "failed":
                error = data.get("task_status_msg", "Video generation failed")
                return {"status": "failed", "error": error}
                
            else:
                # Still processing
                return {"status": "pending"}
                
    except Exception as e:
        logger.error(f"[Kling] Poll error: {e}")
        return {"status": "failed", "error": str(e)}
