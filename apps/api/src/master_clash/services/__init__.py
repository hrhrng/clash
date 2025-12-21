"""
Services package.

Provides clean interfaces to external services:
- r2: Cloudflare R2 storage
- d1: Cloudflare D1 database
- genai: Google GenAI (Gemini)
- kling: Kling Video AI
- gemini_asr: Gemini ASR (Audio/Video Transcription)
- video_intelligence: Google Video Intelligence (Shot Detection)
"""

from master_clash.services import r2, d1, genai, kling
from master_clash.services.gemini_asr import GeminiASRService
from master_clash.services.video_intelligence import VideoIntelligenceService

__all__ = [
    "r2",
    "d1",
    "genai",
    "kling",
    "GeminiASRService",
    "VideoIntelligenceService",
]

