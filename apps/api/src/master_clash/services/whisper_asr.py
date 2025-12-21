"""
Whisper ASR Service - 基于 OpenAI Whisper 的 ASR 服务

实现 ASRProvider 协议，提供带时间戳的高质量语音识别
复用 video_analysis/asr.py 的 AudioTranscriber
"""

import logging
from pathlib import Path

from master_clash.services.protocols import TranscriptionSegmentImpl
from master_clash.video_analysis.asr import AudioTranscriber

logger = logging.getLogger(__name__)


class WhisperASRService:
    """
    Whisper ASR 服务实现

    特点：
    - ✅ 支持 segment 级别的时间戳
    - ✅ 支持 word 级别的时间戳（可选）
    - ✅ 高精度转录
    - ✅ 99 种语言支持
    - ✅ 置信度评分
    """

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "whisper-1",
        timestamp_granularity: str = "segment",
    ):
        """
        初始化 Whisper ASR 服务

        Args:
            api_key: OpenAI API 密钥（可选，默认从配置读取）
            model: Whisper 模型名称
            timestamp_granularity: 时间戳粒度，"segment" 或 "word"
        """
        self.transcriber = AudioTranscriber(api_key=api_key, model=model)
        self.timestamp_granularity = timestamp_granularity
        logger.info(
            f"Initialized WhisperASRService with model: {model}, "
            f"granularity: {timestamp_granularity}"
        )

    async def transcribe_audio(
        self, audio_path: str, language: str | None = None
    ) -> list[TranscriptionSegmentImpl]:
        """
        转录音频文件

        Args:
            audio_path: 音频文件路径
            language: 语言代码（ISO-639-1，如 "en", "zh"）

        Returns:
            转录片段列表，每个片段包含文本和时间戳

        Example:
            >>> service = WhisperASRService()
            >>> segments = await service.transcribe_audio("/path/to/audio.mp3", language="en")
            >>> for seg in segments:
            ...     print(f"{seg.start_time:.2f}s - {seg.end_time:.2f}s: {seg.text}")
        """
        logger.info(f"[WhisperASR] Transcribing audio: {audio_path}")

        # 设置时间戳粒度
        granularities = [self.timestamp_granularity]

        # 调用 Whisper API
        segments = await self.transcriber.transcribe_audio(
            audio_path, language=language, timestamp_granularities=granularities
        )

        # 转换为 Protocol 格式
        result = [
            TranscriptionSegmentImpl(
                text=seg.text,
                start_time=seg.start_time,
                end_time=seg.end_time,
                confidence=seg.confidence,
                language=seg.language,
            )
            for seg in segments
        ]

        logger.info(f"[WhisperASR] Transcription completed: {len(result)} segments")
        return result

    async def transcribe_video(
        self, video_path: str, language: str | None = None, cleanup_audio: bool = True
    ) -> list[TranscriptionSegmentImpl]:
        """
        转录视频文件（自动提取音频）

        Args:
            video_path: 视频文件路径
            language: 语言代码（可选）
            cleanup_audio: 是否删除临时音频文件

        Returns:
            转录片段列表

        Example:
            >>> service = WhisperASRService()
            >>> segments = await service.transcribe_video("/path/to/video.mp4")
            >>> print(f"Total segments: {len(segments)}")
            >>> print(f"Total duration: {segments[-1].end_time:.2f}s")
        """
        logger.info(f"[WhisperASR] Transcribing video: {video_path}")

        # 调用 Whisper API（自动提取音频）
        segments = await self.transcriber.transcribe_video(
            video_path, language=language, cleanup_audio=cleanup_audio
        )

        # 转换为 Protocol 格式
        result = [
            TranscriptionSegmentImpl(
                text=seg.text,
                start_time=seg.start_time,
                end_time=seg.end_time,
                confidence=seg.confidence,
                language=seg.language,
            )
            for seg in segments
        ]

        logger.info(f"[WhisperASR] Video transcription completed: {len(result)} segments")
        return result

    def export_to_srt(
        self, segments: list[TranscriptionSegmentImpl], output_path: str
    ) -> None:
        """
        导出为 SRT 字幕格式

        Args:
            segments: 转录片段
            output_path: 输出文件路径
        """
        # 转换回原始格式
        from master_clash.video_analysis.models import TranscriptionSegment

        original_segments = [
            TranscriptionSegment(
                text=seg.text,
                start_time=seg.start_time,
                end_time=seg.end_time,
                confidence=seg.confidence,
                language=seg.language,
            )
            for seg in segments
        ]

        self.transcriber.export_to_srt(original_segments, output_path)
        logger.info(f"[WhisperASR] Exported SRT to {output_path}")

    def export_to_vtt(
        self, segments: list[TranscriptionSegmentImpl], output_path: str
    ) -> None:
        """
        导出为 VTT 字幕格式

        Args:
            segments: 转录片段
            output_path: 输出文件路径
        """
        from master_clash.video_analysis.models import TranscriptionSegment

        original_segments = [
            TranscriptionSegment(
                text=seg.text,
                start_time=seg.start_time,
                end_time=seg.end_time,
                confidence=seg.confidence,
                language=seg.language,
            )
            for seg in segments
        ]

        self.transcriber.export_to_vtt(original_segments, output_path)
        logger.info(f"[WhisperASR] Exported VTT to {output_path}")
