"""
ASR (语音识别) 模块

使用 OpenAI Whisper API 进行高质量语音转文字
"""

import asyncio
import json
import logging
from pathlib import Path

from openai import AsyncOpenAI

from master_clash.config import get_settings

from .models import TranscriptionSegment

logger = logging.getLogger(__name__)


class AudioTranscriber:
    """音频转录器 - 使用 Whisper API"""

    def __init__(self, api_key: str | None = None, model: str = "whisper-1"):
        """
        初始化转录器

        Args:
            api_key: OpenAI API 密钥，默认从配置读取
            model: Whisper 模型名称
        """
        self.api_key = api_key or get_settings().openai_api_key
        if not self.api_key:
            raise ValueError("OpenAI API key is required for transcription")

        self.client = AsyncOpenAI(api_key=self.api_key)
        self.model = model

    async def extract_audio_from_video(
        self, video_path: str, output_path: str | None = None
    ) -> str:
        """
        从视频提取音频

        Args:
            video_path: 视频文件路径
            output_path: 输出音频路径，默认在同目录

        Returns:
            音频文件路径
        """

        video_path_obj = Path(video_path)
        if output_path is None:
            output_path = str(video_path_obj.with_suffix(".mp3"))

        try:
            # 使用 ffmpeg 提取音频
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

            logger.info(f"Audio extracted to {output_path}")
            return output_path

        except FileNotFoundError:
            raise RuntimeError(
                "FFmpeg not found. Please install FFmpeg: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)"
            ) from None

    async def transcribe_audio(
        self,
        audio_path: str,
        language: str | None = None,
        timestamp_granularities: list[str] | None = None,
    ) -> list[TranscriptionSegment]:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            language: 语言代码（ISO-639-1），如 'en', 'zh' 等，None 表示自动检测
            timestamp_granularities: 时间戳粒度，['word', 'segment']

        Returns:
            转录片段列表
        """
        try:
            if timestamp_granularities is None:
                timestamp_granularities = ["segment"]

            with open(audio_path, "rb") as audio_file:
                # 使用 Whisper API
                kwargs = {
                    "model": self.model,
                    "file": audio_file,
                    "response_format": "verbose_json",
                    "timestamp_granularities": timestamp_granularities,
                }

                if language:
                    kwargs["language"] = language

                logger.info(f"Transcribing audio with model {self.model}...")
                response = await self.client.audio.transcriptions.create(**kwargs)

            # 解析响应
            segments = []
            if hasattr(response, "segments") and response.segments:
                for seg in response.segments:
                    segments.append(
                        TranscriptionSegment(
                            text=seg.text.strip(),
                            start_time=seg.start,
                            end_time=seg.end,
                            confidence=getattr(seg, "confidence", None),
                            language=response.language if hasattr(response, "language") else None,
                        )
                    )
            else:
                # 如果没有分段信息，创建单个片段
                segments.append(
                    TranscriptionSegment(
                        text=response.text,
                        start_time=0.0,
                        end_time=0.0,  # 未知时长
                        language=response.language if hasattr(response, "language") else None,
                    )
                )

            logger.info(f"Transcribed {len(segments)} segments")
            return segments

        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            raise

    async def transcribe_video(
        self, video_path: str, language: str | None = None, cleanup_audio: bool = True
    ) -> list[TranscriptionSegment]:
        """
        直接转录视频（自动提取音频）

        Args:
            video_path: 视频文件路径
            language: 语言代码
            cleanup_audio: 是否删除临时音频文件

        Returns:
            转录片段列表
        """
        # 提取音频
        audio_path = await self.extract_audio_from_video(video_path)

        try:
            # 转录音频
            segments = await self.transcribe_audio(audio_path, language=language)
            return segments

        finally:
            # 清理临时文件
            if cleanup_audio and Path(audio_path).exists():
                Path(audio_path).unlink()
                logger.info(f"Cleaned up temporary audio file: {audio_path}")

    def export_to_srt(self, segments: list[TranscriptionSegment], output_path: str) -> None:
        """
        导出为 SRT 字幕格式

        Args:
            segments: 转录片段
            output_path: 输出文件路径
        """

        def format_timestamp(seconds: float) -> str:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds % 1) * 1000)
            return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

        with open(output_path, "w", encoding="utf-8") as f:
            for i, seg in enumerate(segments, start=1):
                f.write(f"{i}\n")
                f.write(
                    f"{format_timestamp(seg.start_time)} --> {format_timestamp(seg.end_time)}\n"
                )
                f.write(f"{seg.text}\n\n")

        logger.info(f"SRT exported to {output_path}")

    def export_to_vtt(self, segments: list[TranscriptionSegment], output_path: str) -> None:
        """
        导出为 VTT 字幕格式

        Args:
            segments: 转录片段
            output_path: 输出文件路径
        """

        def format_timestamp(seconds: float) -> str:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds % 1) * 1000)
            return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("WEBVTT\n\n")
            for seg in segments:
                f.write(
                    f"{format_timestamp(seg.start_time)} --> {format_timestamp(seg.end_time)}\n"
                )
                f.write(f"{seg.text}\n\n")

        logger.info(f"VTT exported to {output_path}")

    def export_to_json(self, segments: list[TranscriptionSegment], output_path: str) -> None:
        """
        导出为 JSON 格式

        Args:
            segments: 转录片段
            output_path: 输出文件路径
        """
        data = [seg.model_dump() for seg in segments]
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        logger.info(f"JSON exported to {output_path}")
