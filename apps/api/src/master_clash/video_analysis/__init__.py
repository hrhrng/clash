"""
视频分析模块 - 全面的视频理解能力

该模块提供以下功能：
- ASR (语音识别)
- 字幕提取
- 关键帧检测（多种算法）
- Gemini 视频理解
- 综合视频分析编排
"""

from .asr import AudioTranscriber
from .gemini_video import GeminiVideoAnalyzer
from .keyframes import KeyframeDetector
from .models import VideoAnalysisConfig, VideoAnalysisResult

# from .orchestrator import VideoAnalysisOrchestrator
from .subtitles import SubtitleExtractor

# 高级关键帧检测器（可选）
try:
    from .keyframes_advanced import AdvancedKeyframeDetector
    from .keyframes_pyscenedetect import PySceneDetectKeyframeDetector

    _ADVANCED_AVAILABLE = True
except ImportError:
    _ADVANCED_AVAILABLE = False
    AdvancedKeyframeDetector = None
    PySceneDetectKeyframeDetector = None

# CLIP 关键帧检测器（需要额外依赖）
try:
    from .keyframes_clip import CLIPKeyframeDetector

    _CLIP_AVAILABLE = True
except ImportError:
    _CLIP_AVAILABLE = False
    CLIPKeyframeDetector = None

__all__ = [
    "AudioTranscriber",
    "SubtitleExtractor",
    "KeyframeDetector",
    "AdvancedKeyframeDetector",
    "PySceneDetectKeyframeDetector",
    "CLIPKeyframeDetector",
    "GeminiVideoAnalyzer",
    # "VideoAnalysisOrchestrator",
    "VideoAnalysisConfig",
    "VideoAnalysisResult",
]
