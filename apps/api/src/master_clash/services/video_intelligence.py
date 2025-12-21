"""
Google Video Intelligence API - Shot Detection Service

使用 Google Cloud Video Intelligence API 进行视频镜头检测
实现 ShotDetectionProvider 协议
"""

import asyncio
import logging
from pathlib import Path

from google.cloud import videointelligence_v1 as videointelligence

from master_clash.config import get_settings
from master_clash.services.protocols import ShotDetectionResultImpl
from master_clash.services.storage import GCSStorageService

logger = logging.getLogger(__name__)


class VideoIntelligenceService:
    """
    Google Video Intelligence 服务 - 镜头检测

    实现 ShotDetectionProvider 协议
    """

    def __init__(self, storage: GCSStorageService | None = None):
        """
        初始化 Video Intelligence 客户端

        Args:
            storage: GCS 存储服务（可选，默认创建新实例）
        """
        self.client = videointelligence.VideoIntelligenceServiceClient()
        self.settings = get_settings()
        self.storage = storage or GCSStorageService()
        logger.info("Initialized VideoIntelligenceService")


    def _get_mime_type(self, video_path: str) -> str:
        """
        根据文件扩展名获取 MIME 类型

        Args:
            video_path: 视频文件路径

        Returns:
            MIME 类型字符串
        """
        suffix = Path(video_path).suffix.lower()
        mime_types = {
            ".mp4": "video/mp4",
            ".mov": "video/quicktime",
            ".avi": "video/x-msvideo",
            ".mkv": "video/x-matroska",
            ".webm": "video/webm",
            ".flv": "video/x-flv",
            ".wmv": "video/x-ms-wmv",
            ".m4v": "video/x-m4v",
        }
        return mime_types.get(suffix, "video/mp4")

    async def detect_shots(
        self, video_uri: str, cleanup_temp: bool = True
    ) -> list[ShotDetectionResultImpl]:
        """
        检测视频中的镜头切换

        Args:
            video_uri: 视频URI，支持：
                - GCS URI: gs://bucket-name/path/to/video.mp4
                - 本地文件路径: /path/to/video.mp4
            cleanup_temp: 是否清理临时上传的文件（仅本地文件）

        Returns:
            镜头列表（ShotDetectionResultImpl 对象）

        Example:
            ```python
            service = VideoIntelligenceService()

            # 使用 GCS URI
            shots = await service.detect_shots("gs://my-bucket/video.mp4")

            # 使用本地文件
            shots = await service.detect_shots("/path/to/video.mp4")

            # 访问结果
            for shot in shots:
                print(f"{shot.start_time:.2f}s - {shot.end_time:.2f}s ({shot.duration:.2f}s)")
            ```
        """
        logger.info(f"[VideoIntelligence] Starting shot detection: {video_uri}")

        temp_gcs_uri = None
        is_local_file = not video_uri.startswith("gs://")

        try:
            # 如果是本地文件，先上传到 GCS
            if is_local_file:
                if not Path(video_uri).exists():
                    raise FileNotFoundError(f"Video file not found: {video_uri}")

                # 使用 storage 服务上传
                mime_type = self._get_mime_type(video_uri)
                blob_name = self.storage.generate_blob_name(
                    "temp/video_intelligence", Path(video_uri).name
                )
                temp_gcs_uri = await self.storage.upload_file(video_uri, blob_name, mime_type)
                input_uri = temp_gcs_uri
            else:
                input_uri = video_uri

            # 配置请求 - 只检测镜头
            features = [videointelligence.Feature.SHOT_CHANGE_DETECTION]

            # 构建请求
            request = videointelligence.AnnotateVideoRequest(
                input_uri=input_uri,
                features=features,
            )

            # 发起异步请求（在线程池中执行，避免阻塞）
            logger.info("[VideoIntelligence] Sending request to Video Intelligence API...")
            operation = await asyncio.to_thread(
                self.client.annotate_video, request=request
            )

            logger.info(
                "[VideoIntelligence] Waiting for operation to complete (max 5 minutes)..."
            )
            result = await asyncio.to_thread(lambda: operation.result(timeout=300))

            # 解析结果
            shots = []
            for annotation_result in result.annotation_results:
                for shot in annotation_result.shot_annotations:
                    start_time = (
                        shot.start_time_offset.seconds
                        + shot.start_time_offset.microseconds / 1e6
                    )
                    end_time = (
                        shot.end_time_offset.seconds
                        + shot.end_time_offset.microseconds / 1e6
                    )

                    shots.append(
                        ShotDetectionResultImpl(
                            start_time=start_time,
                            end_time=end_time,
                        )
                    )

            logger.info(f"[VideoIntelligence] Detected {len(shots)} shots")
            return shots

        finally:
            # 清理临时文件
            if temp_gcs_uri and cleanup_temp:
                await self.storage.delete_file(temp_gcs_uri)

    def format_shots_summary(self, shots: list[ShotDetectionResultImpl]) -> str:
        """
        格式化镜头检测结果为可读文本

        Args:
            shots: 镜头列表（detect_shots 返回值）

        Returns:
            格式化的文本摘要

        Example:
            ```python
            summary = service.format_shots_summary(shots)
            print(summary)
            # 输出:
            # Total shots detected: 3
            # Shot 1: 0.00s - 5.20s (duration: 5.20s)
            # Shot 2: 5.20s - 12.50s (duration: 7.30s)
            # ...
            ```
        """
        if not shots:
            return "No shots detected"

        lines = [f"Total shots detected: {len(shots)}\n"]

        for i, shot in enumerate(shots, 1):
            lines.append(
                f"Shot {i}: {shot.start_time:.2f}s - {shot.end_time:.2f}s "
                f"(duration: {shot.duration:.2f}s)"
            )

        return "\n".join(lines)

    async def detect_labels(
        self, video_uri: str, cleanup_temp: bool = True
    ) -> list[dict]:
        """
        检测视频中的场景和物体标签（适合"一镜到底"视频分析）

        Args:
            video_uri: 视频URI，支持 GCS URI 或本地文件路径
            cleanup_temp: 是否清理临时上传的文件

        Returns:
            标签列表，每个标签包含:
            - entity: 标签名称（如 "building", "park"）
            - segments: 出现的时间段列表
            - confidence: 置信度

        Example:
            ```python
            labels = await service.detect_labels("video.mp4")
            for label in labels[:10]:
                print(f"{label['entity']}: {label['segments']}")
            ```
        """
        logger.info(f"[VideoIntelligence] Starting label detection: {video_uri}")

        temp_gcs_uri = None
        is_local_file = not video_uri.startswith("gs://")

        try:
            # 如果是本地文件，使用同步上传
            if is_local_file:
                if not Path(video_uri).exists():
                    raise FileNotFoundError(f"Video file not found: {video_uri}")

                # 使用同步客户端上传大文件（避免超时）
                from google.cloud import storage
                import uuid

                bucket_name = self.settings.gcs_bucket_name
                blob_name = f"temp/video_intelligence/{uuid.uuid4()}/{Path(video_uri).name}"
                
                storage_client = storage.Client()
                bucket = storage_client.bucket(bucket_name)
                blob = bucket.blob(blob_name)
                
                logger.info(f"[VideoIntelligence] Uploading to GCS: {blob_name}")
                await asyncio.to_thread(
                    blob.upload_from_filename, video_uri, timeout=600
                )
                temp_gcs_uri = f"gs://{bucket_name}/{blob_name}"
                input_uri = temp_gcs_uri
            else:
                input_uri = video_uri

            # 配置请求 - 检测标签
            features = [videointelligence.Feature.LABEL_DETECTION]
            
            # 配置标签检测选项
            config = videointelligence.LabelDetectionConfig(
                label_detection_mode=videointelligence.LabelDetectionMode.SHOT_AND_FRAME_MODE,
                frame_confidence_threshold=0.5,
            )
            video_context = videointelligence.VideoContext(label_detection_config=config)

            request = videointelligence.AnnotateVideoRequest(
                input_uri=input_uri,
                features=features,
                video_context=video_context,
            )

            logger.info("[VideoIntelligence] Sending label detection request...")
            operation = await asyncio.to_thread(
                self.client.annotate_video, request=request
            )

            logger.info("[VideoIntelligence] Waiting for operation (up to 10 minutes)...")
            result = await asyncio.to_thread(lambda: operation.result(timeout=600))

            # 解析结果
            labels = []
            for annotation_result in result.annotation_results:
                # Segment-level labels (场景级别)
                for label in annotation_result.segment_label_annotations:
                    segments = []
                    for segment in label.segments:
                        start = (
                            segment.segment.start_time_offset.seconds
                            + segment.segment.start_time_offset.microseconds / 1e6
                        )
                        end = (
                            segment.segment.end_time_offset.seconds
                            + segment.segment.end_time_offset.microseconds / 1e6
                        )
                        segments.append({
                            "start": start,
                            "end": end,
                            "confidence": segment.confidence,
                        })
                    
                    labels.append({
                        "entity": label.entity.description,
                        "category": label.category_entities[0].description if label.category_entities else None,
                        "segments": segments,
                    })

            # 按总出现时长排序
            labels.sort(
                key=lambda x: sum(s["end"] - s["start"] for s in x["segments"]),
                reverse=True,
            )

            logger.info(f"[VideoIntelligence] Detected {len(labels)} labels")
            return labels

        finally:
            # 清理临时文件
            if temp_gcs_uri and cleanup_temp:
                try:
                    from google.cloud import storage
                    bucket_name = self.settings.gcs_bucket_name
                    blob_name = temp_gcs_uri.replace(f"gs://{bucket_name}/", "")
                    storage_client = storage.Client()
                    bucket = storage_client.bucket(bucket_name)
                    blob = bucket.blob(blob_name)
                    await asyncio.to_thread(blob.delete)
                    logger.info(f"[VideoIntelligence] Cleaned up: {temp_gcs_uri}")
                except Exception as e:
                    logger.warning(f"[VideoIntelligence] Cleanup failed: {e}")

    def find_highlights(
        self, labels: list[dict], interesting_labels: list[str] | None = None
    ) -> list[dict]:
        """
        从标签检测结果中提取高光时刻

        Args:
            labels: detect_labels() 的返回值
            interesting_labels: 感兴趣的标签列表（可选），如 ["landmark", "bridge", "park"]

        Returns:
            高光时刻列表，按时间排序
        """
        if interesting_labels is None:
            # 默认感兴趣的标签
            interesting_labels = [
                "landmark", "bridge", "tower", "park", "plaza", "monument",
                "skyscraper", "skyline", "river", "beach", "mountain",
            ]

        highlights = []
        for label in labels:
            entity = label["entity"].lower()
            if any(kw in entity for kw in interesting_labels):
                for segment in label["segments"]:
                    highlights.append({
                        "label": label["entity"],
                        "start": segment["start"],
                        "end": segment["end"],
                        "confidence": segment["confidence"],
                    })

        # 按开始时间排序
        highlights.sort(key=lambda x: x["start"])
        return highlights

