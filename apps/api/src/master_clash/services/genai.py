"""
Gemini Service (Native Async) using LangChain + Vertex AI.

Uses:
- google-genai native async (client.aio.files.upload)
- LangChain ainvoke for async generation
"""

import asyncio
import base64
import logging
import tempfile
import uuid
from pathlib import Path

from google import genai
from google.genai import types as genai_types
from langchain_core.messages import HumanMessage
from langchain_google_vertexai import ChatVertexAI

from master_clash.config import get_settings

logger = logging.getLogger(__name__)


def _get_vertex_llm() -> ChatVertexAI:
    """Get LangChain ChatVertexAI instance."""
    return ChatVertexAI(
        model="gemini-2.5-flash",
    )


async def _upload_to_google_files(data: bytes, mime_type: str, filename: str) -> tuple[str, str]:
    """
    Async upload to Google Files API using native async.
    Requires GEMINI_API_KEY.
    """
    settings = get_settings()
    gemini_key = getattr(settings, "gemini_api_key", None)
    
    if not gemini_key:
        raise ValueError("GEMINI_API_KEY not configured")
    
    client = genai.Client(api_key=gemini_key)
    
    # Write to temp file (SDK requires file path)
    suffix = Path(filename).suffix or ".mp4"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(data)
        tmp_path = tmp.name
    
    try:
        # Use native async: client.aio.files.upload()
        uploaded = await client.aio.files.upload(
            file=tmp_path,
            config=genai_types.UploadFileConfig(mime_type=mime_type),
        )
        logger.info(f"[GenAI] Uploaded to Files API: {uploaded.uri}")
        return uploaded.uri, uploaded.mime_type
    finally:
        Path(tmp_path).unlink(missing_ok=True)


from gcloud.aio.storage import Storage

async def _upload_to_gcs(data: bytes, mime_type: str, filename: str) -> str:
    """
    Async upload to Google Cloud Storage using gcloud-aio-storage.
    Returns gs:// URI.
    """
    settings = get_settings()
    if not settings.gcs_bucket_name:
        raise ValueError("GCP_BUCKET_NAME not configured")

    # Use a unique name for the temporary file in GCS
    blob_name = f"temp/{uuid.uuid4()}/{filename}"
    
    async with Storage() as client:
        await client.upload(
            settings.gcs_bucket_name,
            blob_name,
            data,
            content_type=mime_type
        )
        
    return f"gs://{settings.gcs_bucket_name}/{blob_name}"


async def _delete_from_gcs(gs_uri: str):
    """Delete object from GCS (cleanup) using gcloud-aio-storage."""
    try:
        settings = get_settings()
        if not settings.gcs_bucket_name:
            return
            
        # Parse blob name from URI: gs://bucket/blob_name
        prefix = f"gs://{settings.gcs_bucket_name}/"
        if not gs_uri.startswith(prefix):
            return
            
        blob_name = gs_uri[len(prefix):]
        
        async with Storage() as client:
            await client.delete(settings.gcs_bucket_name, blob_name)
            
        logger.info(f"[GenAI] Deleted temporary GCS object: {gs_uri}")
    except Exception as e:
        logger.warning(f"[GenAI] Failed to cleanup GCS object {gs_uri}: {e}")

async def generate_description_from_bytes(data: bytes, mime_type: str) -> str:
    """
    Async generate description for image/video bytes.
    
    Strategy for Video:
    1. GCS (Preferred if GCP_BUCKET_NAME is set) -> gs:// URI
    2. Google Files API (If GEMINI_API_KEY is allowed/set) -> https:// URI
    3. Inline Base64 (Fallback/Vertex default) -> data: URI
    """
    logger.info(f"[GenAI] Generating description ({len(data)} bytes, {mime_type})")
    
    settings = get_settings()
    llm = _get_vertex_llm()
    
    content_block = [
        {"type": "text", "text": "Describe this asset in detail. Focus on visual elements, style, mood, and any notable features. Keep the description concise but comprehensive."}
    ]
    
    gcs_uri = None
    gemini_key = getattr(settings, "gemini_api_key", None)
    
    try:
        if mime_type.startswith("video/"):
            if settings.gcs_bucket_name:
                # 1. Upload to GCS (Best for Vertex AI)
                gcs_uri = await _upload_to_gcs(data, mime_type, "video.mp4")
                content_block.append({
                    "type": "media",
                    "file_uri": gcs_uri,
                    "mime_type": mime_type,
                })
            elif gemini_key:
                # 2. Upload to Google Files API (Gemini Developer API only)
                file_uri, actual_mime = await _upload_to_google_files(data, mime_type, "video.mp4")
                content_block.append({
                    "type": "media",
                    "file_uri": file_uri,
                    "mime_type": actual_mime,
                })
            else:
                # 3. Inline Base64 (Vertex AI fallback, size limited)
                b64_data = base64.b64encode(data).decode("utf-8")
                content_block.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{mime_type};base64,{b64_data}"},
                })
        else:
            # Images: Inline base64 is standard
            b64_data = base64.b64encode(data).decode("utf-8")
            content_block.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{b64_data}"},
            })
        
        message = HumanMessage(content=content_block)
        
        # Use ainvoke for native async
        response = await llm.ainvoke([message])
        
        description = response.content
        logger.info(f"[GenAI] Generated: \"{description[:100]}...\"")
        return description

    finally:
        # Cleanup GCS object if used (short TTL simulation)
        if gcs_uri:
            await _delete_from_gcs(gcs_uri)
