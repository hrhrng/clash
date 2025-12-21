"""
R2 Storage Service (Native Async).

Uses aioboto3 for native async S3 operations.
"""

import logging
from contextlib import asynccontextmanager

import aioboto3
from botocore.config import Config

from master_clash.config import get_settings

logger = logging.getLogger(__name__)


def _get_session():
    """Get aioboto3 session."""
    return aioboto3.Session()


@asynccontextmanager
async def _get_client():
    """Get async S3 client for R2."""
    settings = get_settings()
    
    if not settings.r2_account_id or not settings.r2_access_key_id:
        raise ValueError("R2 credentials not configured")
    
    session = _get_session()
    async with session.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
        ),
        region_name="auto",
    ) as client:
        yield client


async def fetch_object(key: str) -> tuple[bytes, str]:
    """
    Async fetch object from R2.
    
    Args:
        key: Object key in bucket
        
    Returns:
        Tuple of (data bytes, content type)
    """
    settings = get_settings()
    logger.info(f"[R2] Fetching: {key}")
    
    async with _get_client() as client:
        response = await client.get_object(Bucket=settings.r2_bucket_name, Key=key)
        data = await response["Body"].read()
        content_type = response.get("ContentType", "application/octet-stream")
    
    logger.info(f"[R2] Fetched {len(data)} bytes")
    return data, content_type


async def put_object(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """
    Async upload object to R2.
    
    Args:
        key: Object key
        data: Data bytes
        content_type: MIME type
        
    Returns:
        Object key
    """
    settings = get_settings()
    logger.info(f"[R2] Uploading: {key} ({len(data)} bytes)")
    
    async with _get_client() as client:
        await client.put_object(
            Bucket=settings.r2_bucket_name,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
    
    logger.info(f"[R2] Uploaded: {key}")
    return key
