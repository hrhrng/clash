"""
Cloud Storage Service - GCS 存储服务的通用实现

实现 StorageProvider 协议，提供可复用的云存储功能
"""

import logging
import uuid
from pathlib import Path

from gcloud.aio.storage import Storage

from master_clash.config import get_settings

logger = logging.getLogger(__name__)


class GCSStorageService:
    """Google Cloud Storage 服务实现"""

    def __init__(self, bucket_name: str | None = None):
        """
        初始化 GCS 存储服务

        Args:
            bucket_name: GCS bucket 名称（可选，默认从配置读取）
        """
        self.settings = get_settings()
        self.bucket_name = bucket_name or self.settings.gcs_bucket_name

        if not self.bucket_name:
            raise ValueError("GCS_BUCKET_NAME not configured")

        logger.info(f"Initialized GCSStorageService with bucket: {self.bucket_name}")

    async def upload_file(
        self, file_path: str, blob_name: str | None = None, mime_type: str = "application/octet-stream"
    ) -> str:
        """
        上传文件到 GCS

        Args:
            file_path: 本地文件路径
            blob_name: 远程 blob 名称（可选，自动生成）
            mime_type: 文件 MIME 类型

        Returns:
            GCS URI (gs://bucket/path)
        """
        # 读取文件
        with open(file_path, "rb") as f:
            data = f.read()

        # 生成 blob 名称（如果未提供）
        if blob_name is None:
            filename = Path(file_path).name
            blob_name = f"temp/{uuid.uuid4()}/{filename}"

        # 上传
        return await self.upload_bytes(data, blob_name, mime_type)

    async def upload_bytes(
        self, data: bytes, blob_name: str, mime_type: str = "application/octet-stream", timeout: int = 600
    ) -> str:
        """
        上传字节数据到 GCS

        Args:
            data: 字节数据
            blob_name: 远程 blob 名称
            mime_type: 文件 MIME 类型
            timeout: 上传超时时间（秒，默认 600 秒 = 10分钟）

        Returns:
            GCS URI
        """
        import aiohttp
        
        # Create session with extended timeout for large files
        connector = aiohttp.TCPConnector(limit=10)
        client_timeout = aiohttp.ClientTimeout(total=timeout, connect=60, sock_read=300)
        
        async with aiohttp.ClientSession(connector=connector, timeout=client_timeout) as session:
            async with Storage(session=session) as client:
                await client.upload(
                    self.bucket_name,
                    blob_name,
                    data,
                    content_type=mime_type,
                )

        gcs_uri = f"gs://{self.bucket_name}/{blob_name}"
        logger.info(f"[GCS] Uploaded to {gcs_uri} ({len(data)} bytes)")
        return gcs_uri

    async def delete_file(self, uri: str) -> None:
        """
        删除 GCS 中的文件

        Args:
            uri: GCS URI (gs://bucket/path)
        """
        try:
            # 解析 blob 名称
            prefix = f"gs://{self.bucket_name}/"
            if not uri.startswith(prefix):
                logger.warning(f"URI does not match bucket: {uri}")
                return

            blob_name = uri[len(prefix) :]

            # 删除文件
            async with Storage() as client:
                await client.delete(self.bucket_name, blob_name)

            logger.info(f"[GCS] Deleted {uri}")
        except Exception as e:
            logger.warning(f"[GCS] Failed to delete {uri}: {e}")

    async def get_public_url(self, uri: str) -> str:
        """
        获取文件的公共访问 URL

        Args:
            uri: GCS URI

        Returns:
            公共 HTTP(S) URL
        """
        # 解析 blob 名称
        prefix = f"gs://{self.bucket_name}/"
        if not uri.startswith(prefix):
            raise ValueError(f"Invalid GCS URI: {uri}")

        blob_name = uri[len(prefix) :]

        # 生成公共 URL
        public_url = f"https://storage.googleapis.com/{self.bucket_name}/{blob_name}"
        return public_url

    def generate_blob_name(self, prefix: str, filename: str) -> str:
        """
        生成唯一的 blob 名称

        Args:
            prefix: 前缀目录（如 "temp/asr"）
            filename: 文件名

        Returns:
            完整的 blob 名称
        """
        return f"{prefix}/{uuid.uuid4()}/{filename}"
