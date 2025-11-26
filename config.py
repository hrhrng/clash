"""
Configuration module for video production system.
Contains model settings, API keys, and environment variables.
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


TEXT_MODEL_NAME = "gemini-flash-latest"
IMAGE_MODEL_NAME = "gemini-2.5-flash-image"
# API Keys
GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "AIzaSyBFhyItl61CrSDyQEXIqQzwNOBwO8Pgv_o")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", GOOGLE_API_KEY)
NANO_BANANA_API_KEY = os.environ.get("NANO_BANANA_API_KEY", "6094ea861eb8183c5aa3bce1ffe981da")

# API URLs
NANO_BANANA_BASE_URL = "https://api.kie.ai/api/v1/jobs"

# AI Gateway Configuration
AI_GATEWAY_API_KEY = os.getenv("AI_GATEWAY_API_KEY") or os.getenv("VERCEL_OIDC_TOKEN") or "vck_1cXg3aB18kewl7egHKcpLCVICAiVSaPoQvsV6RqjhQjMgk2rVR4BW0bu"
AI_GATEWAY_BASE_URL = os.getenv("AI_GATEWAY_BASE_OPENAI_COMPAT_URL") or "https://ai-gateway.vercel.sh/v1"

# Directory Configuration
PRODUCTION_ASSETS_DIR = "production_assets"
OUTPUT_DIR = "output"

# Set Google API Key in environment
os.environ["GOOGLE_API_KEY"] = GOOGLE_API_KEY

def print_config():
    """Print current configuration."""
    print(f"Using Models: Text='{TEXT_MODEL_NAME}', Image='{IMAGE_MODEL_NAME}'")
