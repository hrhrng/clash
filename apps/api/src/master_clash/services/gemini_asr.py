"""
Gemini ASR Service - 使用 Vertex AI Gemini 进行音频转录

基于现有的 Vertex AI 配置，复用 genai.py 的文件上传逻辑
"""

import asyncio
import logging
import tempfile
import uuid
from pathlib import Path

from gcloud.aio.storage import Storage
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from master_clash.config import get_settings

logger = logging.getLogger(__name__)


class GeminiASRService:
    """使用 Google Gemini 进行音频转录"""

    def __init__(self, model: str = "gemini-2.0-flash-exp"):
        """
        初始化 Gemini ASR 服务

        Args:
            model: Gemini 模型名称
        """
        self.model = model
        self.settings = get_settings()

        # 使用 ChatGoogleGenerativeAI (推荐的新 API)
        self.llm = ChatGoogleGenerativeAI(
            model=model,
            google_api_key=self.settings.google_api_key,
        )

        logger.info(f"Initialized GeminiASRService with model: {model}")

    async def _upload_to_gcs(
        self, file_path: str, mime_type: str = "audio/mp3"
    ) -> str:
        """
        上传文件到 GCS（复用 genai.py 的逻辑）

        Args:
            file_path: 本地文件路径
            mime_type: 文件 MIME 类型

        Returns:
            GCS URI (gs://bucket/path)
        """
        if not self.settings.gcs_bucket_name:
            raise ValueError("GCS_BUCKET_NAME not configured")

        # 读取文件
        with open(file_path, "rb") as f:
            data = f.read()

        # 生成唯一的 blob 名称
        filename = Path(file_path).name
        blob_name = f"temp/gemini_asr/{uuid.uuid4()}/{filename}"

        # 上传到 GCS
        async with Storage() as client:
            await client.upload(
                self.settings.gcs_bucket_name,
                blob_name,
                data,
                content_type=mime_type,
            )

        gcs_uri = f"gs://{self.settings.gcs_bucket_name}/{blob_name}"
        logger.info(f"[GeminiASR] Uploaded to GCS: {gcs_uri}")
        return gcs_uri

    async def _delete_from_gcs(self, gcs_uri: str):
        """
        从 GCS 删除临时文件（清理）

        Args:
            gcs_uri: GCS URI
        """
        try:
            if not self.settings.gcs_bucket_name:
                return

            # 解析 blob 名称
            prefix = f"gs://{self.settings.gcs_bucket_name}/"
            if not gcs_uri.startswith(prefix):
                return

            blob_name = gcs_uri[len(prefix) :]

            # 删除文件
            async with Storage() as client:
                await client.delete(self.settings.gcs_bucket_name, blob_name)

            logger.info(f"[GeminiASR] Deleted temporary GCS object: {gcs_uri}")
        except Exception as e:
            logger.warning(f"[GeminiASR] Failed to cleanup GCS object {gcs_uri}: {e}")

    async def _extract_audio_from_video(
        self, video_path: str, output_path: str | None = None
    ) -> str:
        """
        从视频提取音频（使用 FFmpeg）

        Args:
            video_path: 视频文件路径
            output_path: 输出音频路径，默认在临时目录

        Returns:
            音频文件路径
        """
        if output_path is None:
            # 创建临时文件
            temp_dir = tempfile.gettempdir()
            output_path = str(Path(temp_dir) / f"{uuid.uuid4()}.mp3")

        try:
            # 使用 FFmpeg 提取音频
            cmd = [
                "ffmpeg",
                "-i",
                video_path,
                "-vn",  # 禁用视频
                "-acodec",
                "libmp3lame",  # 使用 MP3 编码
                "-ar",
                "16000",  # 16kHz 采样率
                "-ac",
                "1",  # 单声道
                "-b:a",
                "64k",  # 比特率
                "-y",  # 覆盖输出文件
                output_path,
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                raise RuntimeError(f"FFmpeg failed: {error_msg}")

            logger.info(f"[GeminiASR] Audio extracted to {output_path}")
            return output_path

        except FileNotFoundError:
            raise RuntimeError(
                "FFmpeg not found. Please install FFmpeg: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)"
            ) from None

    def _build_transcription_prompt(self, language: str | None = None) -> str:
        """
        构建转录提示词

        Args:
            language: 语言代码（如 "zh", "en"）

        Returns:
            提示词文本
        """
        base_prompt = "请将这段音频准确转录为文本，保持说话者的原话。"

        if language:
            lang_map = {
                "zh": "中文",
                "en": "英文",
                "ja": "日文",
                "ko": "韩文",
                "es": "西班牙语",
                "fr": "法语",
                "de": "德语",
            }
            lang_name = lang_map.get(language, language)
            base_prompt += f"\n语言: {lang_name}"

        base_prompt += "\n\n要求：\n1. 逐字转录，不要遗漏或添加内容\n2. 保持原始语序和表达\n3. 对于不清晰的部分，用 [不清晰] 标记\n4. 只返回转录文本，不要添加额外的说明或格式"

        return base_prompt

    async def transcribe_audio(
        self, audio_path: str, language: str | None = None
    ) -> str:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            language: 语言代码（可选，如 "zh", "en"）

        Returns:
            转录文本
        """
        logger.info(f"[GeminiASR] Starting audio transcription: {audio_path}")

        gcs_uri = None
        try:
            # 1. 上传到 GCS
            gcs_uri = await self._upload_to_gcs(audio_path, mime_type="audio/mp3")

            # 2. 构建 LangChain 消息
            prompt = self._build_transcription_prompt(language)
            message = HumanMessage(
                content=[
                    {"type": "text", "text": prompt},
                    {"type": "media", "file_uri": gcs_uri, "mime_type": "audio/mp3"},
                ]
            )

            # 3. 调用 Gemini
            logger.info("[GeminiASR] Calling Gemini for transcription...")
            response = await self.llm.ainvoke([message])

            transcript = response.content.strip()
            logger.info(f"[GeminiASR] Transcription completed: {len(transcript)} chars")

            return transcript

        finally:
            # 4. 清理临时文件
            if gcs_uri:
                await self._delete_from_gcs(gcs_uri)

    async def transcribe_video(
        self, video_path: str, language: str | None = None, cleanup_audio: bool = True
    ) -> str:
        """
        转录视频文件（自动提取音频）

        Args:
            video_path: 视频文件路径
            language: 语言代码（可选）
            cleanup_audio: 是否删除临时音频文件

        Returns:
            转录文本
        """
        logger.info(f"[GeminiASR] Starting video transcription: {video_path}")

        audio_path = None
        try:
            # 1. 提取音频
            audio_path = await self._extract_audio_from_video(video_path)

            # 2. 转录音频
            transcript = await self.transcribe_audio(audio_path, language=language)

            return transcript

        finally:
            # 3. 清理临时音频文件
            if cleanup_audio and audio_path and Path(audio_path).exists():
                Path(audio_path).unlink()
                logger.info(f"[GeminiASR] Cleaned up temporary audio file: {audio_path}")
