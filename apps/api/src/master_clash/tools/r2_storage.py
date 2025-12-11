"""
Cloudflare R2 Object Storage utility for uploading/downloading assets.

R2 is S3-compatible, so we use boto3 for interaction.
"""

import base64
import uuid
from io import BytesIO
from pathlib import Path
from typing import Literal

import boto3
from botocore.client import Config

from master_clash.config import get_settings


AssetType = Literal["image", "video", "audio", "text"]


class R2Storage:
    """Cloudflare R2 storage client for asset management."""

    def __init__(self):
        """Initialize R2 client with configuration from settings."""
        settings = get_settings()

        if not all([
            settings.r2_account_id,
            settings.r2_access_key_id,
            settings.r2_secret_access_key,
            settings.r2_bucket_name,
        ]):
            raise ValueError(
                "R2 configuration incomplete. Please set R2_ACCOUNT_ID, "
                "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME"
            )

        self.bucket_name = settings.r2_bucket_name
        self.public_url = settings.r2_public_url

        # Create S3-compatible client
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4"),
        )

    def upload_base64_image(
        self,
        base64_data: str,
        project_id: str,
        filename: str | None = None,
        content_type: str = "image/png",
    ) -> tuple[str, str]:
        """
        Upload a base64-encoded image to R2.

        Args:
            base64_data: Base64-encoded image data
            project_id: Project ID for organizing assets
            filename: Optional custom filename (without extension)
            content_type: MIME type (default: image/png)

        Returns:
            Tuple of (storage_key, public_url)
        """
        # Generate unique filename if not provided
        if not filename:
            filename = str(uuid.uuid4())

        # Determine file extension from content type
        ext = content_type.split("/")[-1]
        if ext == "jpeg":
            ext = "jpg"

        # Generate storage key (path in R2)
        storage_key = f"projects/{project_id}/assets/{filename}.{ext}"

        # Decode base64
        image_bytes = base64.b64decode(base64_data)

        # Upload to R2
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=storage_key,
            Body=image_bytes,
            ContentType=content_type,
        )

        # Generate public URL
        public_url = f"{self.public_url}/{storage_key}"

        return storage_key, public_url

    def upload_file(
        self,
        file_path: str | Path,
        project_id: str,
        filename: str | None = None,
        content_type: str | None = None,
    ) -> tuple[str, str]:
        """
        Upload a file to R2.

        Args:
            file_path: Path to file to upload
            project_id: Project ID for organizing assets
            filename: Optional custom filename
            content_type: Optional MIME type (auto-detected if not provided)

        Returns:
            Tuple of (storage_key, public_url)
        """
        file_path = Path(file_path)

        # Generate unique filename if not provided
        if not filename:
            filename = str(uuid.uuid4())

        # Keep original extension
        ext = file_path.suffix
        if not ext:
            ext = ".bin"

        # Generate storage key
        storage_key = f"projects/{project_id}/assets/{filename}{ext}"

        # Auto-detect content type if not provided
        if not content_type:
            extension_to_mime = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".gif": "image/gif",
                ".mp4": "video/mp4",
                ".webm": "video/webm",
                ".mp3": "audio/mpeg",
                ".wav": "audio/wav",
                ".txt": "text/plain",
                ".json": "application/json",
            }
            content_type = extension_to_mime.get(ext.lower(), "application/octet-stream")

        # Upload to R2
        with open(file_path, "rb") as f:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=storage_key,
                Body=f,
                ContentType=content_type,
            )

        # Generate public URL
        public_url = f"{self.public_url}/{storage_key}"

        return storage_key, public_url

    def upload_video_from_url(
        self,
        video_url: str,
        project_id: str,
        filename: str | None = None,
    ) -> tuple[str, str]:
        """
        Download video from URL and upload to R2.

        Args:
            video_url: URL of video to download
            project_id: Project ID for organizing assets
            filename: Optional custom filename

        Returns:
            Tuple of (storage_key, public_url)
        """
        import httpx

        # Download video
        with httpx.Client() as client:
            response = client.get(video_url, follow_redirects=True)
            response.raise_for_status()
            video_bytes = response.content

        # Generate unique filename if not provided
        if not filename:
            filename = str(uuid.uuid4())

        # Generate storage key
        storage_key = f"projects/{project_id}/assets/{filename}.mp4"

        # Upload to R2
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=storage_key,
            Body=video_bytes,
            ContentType="video/mp4",
        )

        # Generate public URL
        public_url = f"{self.public_url}/{storage_key}"

        return storage_key, public_url

    def delete_asset(self, storage_key: str) -> None:
        """
        Delete an asset from R2.

        Args:
            storage_key: R2 object key to delete
        """
        self.s3_client.delete_object(
            Bucket=self.bucket_name,
            Key=storage_key,
        )

    def asset_exists(self, storage_key: str) -> bool:
        """
        Check if an asset exists in R2.

        Args:
            storage_key: R2 object key to check

        Returns:
            True if asset exists, False otherwise
        """
        try:
            self.s3_client.head_object(
                Bucket=self.bucket_name,
                Key=storage_key,
            )
            return True
        except:
            return False


# Singleton instance
_r2_storage: R2Storage | None = None


def get_r2_storage() -> R2Storage:
    """Get singleton R2 storage instance."""
    global _r2_storage
    if _r2_storage is None:
        _r2_storage = R2Storage()
    return _r2_storage
