"""
Services package.

Provides clean interfaces to external services:
- r2: Cloudflare R2 storage
- d1: Cloudflare D1 database
- genai: Google GenAI (Gemini)
"""

from master_clash.services import r2, d1, genai

__all__ = ["r2", "d1", "genai"]
