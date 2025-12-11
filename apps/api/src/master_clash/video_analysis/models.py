"""
视频分析的数据模型定义
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TranscriptionSegment(BaseModel):
    """语音转文字的单个片段"""

    text: str
    start_time: float  # 秒
    end_time: float  # 秒
    confidence: float | None = None
    language: str | None = None


class SubtitleTrack(BaseModel):
    """字幕轨道"""

    language: str
    segments: list[TranscriptionSegment]
    format: str  # srt, vtt, ass 等


class Keyframe(BaseModel):
    """关键帧"""

    timestamp: float  # 秒
    frame_number: int
    image_path: str
    description: str | None = None
    score: float | None = None  # 关键帧重要性评分
    features: dict[str, Any] | None = None  # 可选的视觉特征


class GeminiVideoInsight(BaseModel):
    """Gemini 视频理解的结果"""

    summary: str
    key_moments: list[dict[str, Any]]
    objects_detected: list[str]
    scenes: list[dict[str, Any]]
    activities: list[str]
    emotions: list[str] | None = None
    text_in_video: list[str] | None = None
    audio_events: list[str] | None = None
    metadata: dict[str, Any] | None = None


class VideoMetadata(BaseModel):
    """视频元数据"""

    duration: float  # 秒
    fps: float
    width: int
    height: int
    codec: str | None = None
    bitrate: int | None = None
    size_bytes: int | None = None
    has_audio: bool = True


class VideoAnalysisResult(BaseModel):
    """综合视频分析结果"""

    video_path: str
    video_id: str = Field(default_factory=lambda: datetime.now().strftime("%Y%m%d_%H%M%S"))
    metadata: VideoMetadata

    # 转录结果
    transcription: list[TranscriptionSegment] | None = None

    # 字幕提取结果
    subtitles: list[SubtitleTrack] | None = None

    # 关键帧
    keyframes: list[Keyframe] | None = None

    # Gemini 视频理解
    gemini_insights: GeminiVideoInsight | None = None

    # 综合分析
    summary: str | None = None
    tags: list[str] | None = None
    categories: list[str] | None = None

    # 时间戳
    analysis_timestamp: datetime = Field(default_factory=datetime.now)
    processing_time_seconds: float | None = None

    # 错误信息
    errors: list[str] | None = None


class VideoAnalysisConfig(BaseModel):
    """视频分析配置"""

    # ASR 配置
    enable_asr: bool = True
    asr_language: str = "auto"  # 自动检测或指定语言代码
    asr_model: str = "whisper-large-v3"  # whisper 模型选择

    # 字幕提取配置
    enable_subtitle_extraction: bool = True
    subtitle_languages: list[str] | None = None

    # 关键帧检测配置
    enable_keyframe_detection: bool = True
    keyframe_interval: int | None = None  # 秒，None 表示自动
    keyframe_threshold: float = 0.3  # 场景变化阈值
    max_keyframes: int = 50

    # Gemini 视频理解配置
    enable_gemini_analysis: bool = True
    gemini_model: str = "gemini-2.0-flash-exp"
    gemini_prompt: str | None = None  # 自定义提示词

    # 输出配置
    save_keyframes: bool = True
    keyframes_output_dir: str | None = None
    save_transcription: bool = True
    transcription_format: str = "json"  # json, srt, vtt

    # 性能配置
    max_workers: int = 4
    chunk_duration: int | None = None  # 分块处理视频（秒）
