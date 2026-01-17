"""
Services package.

Provides clean interfaces to external services:
- r2: Cloudflare R2 storage
- d1: Cloudflare D1 database
- genai: Google GenAI (Gemini)
- kling: Kling Video AI
- generation_models: Unified model registry + dispatchers
- gemini_asr: Gemini ASR (Audio/Video Transcription)
- video_intelligence: Google Video Intelligence (Shot Detection)
- remotion_render: Remotion video rendering service
"""

from master_clash.services import d1, genai, kling, r2, generation_models, kling_kie_client
from master_clash.services.gemini_asr import GeminiASRService
from master_clash.services.video_intelligence import VideoIntelligenceService

__all__ = [
    "r2",
    "d1",
    "genai",
    "kling",
    "generation_models",
    "kling_kie_client",
    "GeminiASRService",
    "VideoIntelligenceService",
]
