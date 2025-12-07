"""
Configuration management for master-clash application.

This module provides centralized configuration management using Pydantic Settings.
It supports multiple environments (development, staging, production) and loads
settings from environment variables and .env files.

Usage:
    from master_clash.config import get_settings

    settings = get_settings()
    print(settings.openai_api_key)
"""

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables and .env files.

    Environment variables take precedence over .env file values.
    """

    # =============================================================================
    # Application Settings
    # =============================================================================
    app_name: str = Field(
        default="master-clash",
        description="Application name"
    )

    environment: Literal["development", "staging", "production"] = Field(
        default="development",
        description="Current environment"
    )

    debug: bool = Field(
        default=False,
        description="Enable debug mode"
    )

    # =============================================================================
    # API Keys
    # =============================================================================
    openai_api_key: str | None = Field(
        default=None,
        description="OpenAI API key for GPT models"
    )

    google_api_key: str = Field(
        ...,  # Required field
        description="Google AI API key for Gemini models"
    )
    
    google_cloud_api_key: str = Field(
        ...,  # Required field
        description="Google AI API key for Gemini models"
    )
    
    google_vertex_base_url: str = Field(
        ...,  # Required field
        description="Google AI API key for Gemini models"
    )

    anthropic_api_key: str | None = Field(
        default=None,
        description="Anthropic API key for Claude models"
    )

    replicate_api_key: str | None = Field(
        default=None,
        description="Replicate API key for various AI models"
    )

    stability_api_key: str | None = Field(
        default=None,
        description="Stability AI API key for image generation"
    )

    kie_api_key: str | None = Field(
        default=None,
        description="KIE.ai API key for Kling text-to-video generation"
    )

    # =============================================================================
    # Google AI Studio Configuration
    # =============================================================================
    google_ai_studio_base_url: str | None = Field(
        description="Base URL for Google AI Studio API (via Cloudflare Gateway)"
    )

    # =============================================================================
    # Database Configuration
    # =============================================================================
    database_url: str | None = Field(
        default=None,
        description="Database connection URL"
    )

    # =============================================================================
    # Storage Configuration
    # =============================================================================
    output_dir: Path = Field(
        default=Path("./output"),
        description="Directory for output files"
    )

    assets_dir: Path = Field(
        default=Path("./assets"),
        description="Directory for asset files"
    )

    # AWS S3 Configuration (optional)
    aws_access_key_id: str | None = Field(
        default=None,
        description="AWS access key ID"
    )

    aws_secret_access_key: str | None = Field(
        default=None,
        description="AWS secret access key"
    )

    aws_s3_bucket: str | None = Field(
        default=None,
        description="AWS S3 bucket name"
    )

    aws_region: str = Field(
        default="us-east-1",
        description="AWS region"
    )

    # =============================================================================
    # Cloudflare R2 Configuration
    # =============================================================================
    r2_account_id: str | None = Field(
        default=None,
        description="Cloudflare R2 account ID"
    )

    r2_access_key_id: str | None = Field(
        default=None,
        description="R2 access key ID (S3-compatible)"
    )

    r2_secret_access_key: str | None = Field(
        default=None,
        description="R2 secret access key (S3-compatible)"
    )

    r2_bucket_name: str | None = Field(
        default=None,
        description="R2 bucket name"
    )

    r2_public_url: str | None = Field(
        default=None,
        description="R2 public URL domain (e.g., https://pub-xxx.r2.dev)"
    )

    @property
    def r2_endpoint(self) -> str | None:
        """Generate R2 S3-compatible endpoint URL."""
        if self.r2_account_id:
            return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return None

    # =============================================================================
    # Cloudflare D1 Configuration (for LangGraph Checkpointer)
    # =============================================================================
    cloudflare_account_id: str | None = Field(
        default=None,
        description="Cloudflare account ID"
    )

    cloudflare_d1_database_id: str | None = Field(
        default=None,
        description="D1 database ID for LangGraph checkpointer"
    )

    cloudflare_api_token: str | None = Field(
        default=None,
        description="Cloudflare API token with D1 edit permissions"
    )

    @property
    def use_d1_checkpointer(self) -> bool:
        """Check if D1 checkpointer is configured."""
        return all([
            self.cloudflare_account_id,
            self.cloudflare_d1_database_id,
            self.cloudflare_api_token,
        ])

    # =============================================================================
    # Application Configuration
    # =============================================================================
    max_workers: int = Field(
        default=4,
        ge=1,
        le=32,
        description="Maximum number of concurrent workers"
    )

    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = Field(
        default="INFO",
        description="Logging level"
    )

    # =============================================================================
    # External Services
    # =============================================================================
    redis_url: str | None = Field(
        default=None,
        description="Redis connection URL for caching/queue"
    )

    sentry_dsn: str | None = Field(
        default=None,
        description="Sentry DSN for error tracking"
    )

    # =============================================================================
    # Security
    # =============================================================================
    secret_key: str | None = Field(
        default=None,
        description="Secret key for encryption/signing"
    )

    allowed_hosts: list[str] = Field(
        default=["localhost", "127.0.0.1"],
        description="Allowed hosts for the application"
    )

    # =============================================================================
    # Development Settings
    # =============================================================================
    enable_cache: bool = Field(
        default=True,
        description="Enable caching"
    )

    enable_telemetry: bool = Field(
        default=False,
        description="Enable telemetry/analytics"
    )

    # =============================================================================
    # Validators
    # =============================================================================
    @field_validator("output_dir", "assets_dir", mode="before")
    @classmethod
    def parse_path(cls, v) -> Path:
        """Convert string paths to Path objects."""
        if isinstance(v, str):
            return Path(v)
        return v

    @field_validator("allowed_hosts", mode="before")
    @classmethod
    def parse_allowed_hosts(cls, v) -> list[str]:
        """Parse comma-separated allowed hosts."""
        if isinstance(v, str):
            return [host.strip() for host in v.split(",")]
        return v

    # =============================================================================
    # Configuration
    # =============================================================================
    model_config = SettingsConfigDict(
        env_file=Path(__file__).parent.parent.parent / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore extra environment variables
    )

    # =============================================================================
    # Properties
    # =============================================================================
    @property
    def is_production(self) -> bool:
        """Check if running in production environment."""
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        """Check if running in development environment."""
        return self.environment == "development"

    @property
    def is_staging(self) -> bool:
        """Check if running in staging environment."""
        return self.environment == "staging"

    def ensure_directories(self) -> None:
        """Ensure output and assets directories exist."""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.assets_dir.mkdir(parents=True, exist_ok=True)


@lru_cache()
def get_settings() -> Settings:
    """
    Get application settings (cached singleton).

    Returns:
        Settings: Application settings instance

    Example:
        >>> settings = get_settings()
        >>> print(settings.openai_api_key)
    """
    return Settings()


def reload_settings() -> Settings:
    """
    Reload settings (useful for testing or dynamic config changes).

    Returns:
        Settings: New settings instance
    """
    get_settings.cache_clear()
    return get_settings()


# Convenience export
settings = get_settings()
# for google credentials
os.environ["GOOGLE_API_KEY"] = settings.google_api_key
os.environ['GOOGLE_CLOUD_API_KEY'] = settings.google_cloud_api_key


from google import genai
from google.genai import types
import base64
import os

def generate():
  client = genai.Client(
      vertexai=True,
      api_key=os.environ.get("GOOGLE_CLOUD_API_KEY"),
  )

  si_text1 = """You are a financial analyst assistant AI assigned to a company. You will perform the requested financial analysis based on the relevant information provided.

Rules:
* Do not hallucinate.
* Do not use the internet.
* Use only the information provided.
* Write only in English.
* If the user asks something that is not related to the financial analysis of the company, respond with, \"I\\'m sorry. I only help with financial analysis. Please try again.\"

Instructions:
1. If the user requests an income statement analysis:
a. Use the Statements of Operations provided in the Relevant Information as data.
b. Calculate and discuss the gross profit margin.
c. Calculate and discuss the operating profit margin.
d. Calculate and discuss the net profit margin.
e. Provide recommendations based on the data.

2. If the user requests a cash flow analysis:
a. Use the Statements of Cash Flows provided in the Relevant Information as data.
b. Discuss the operating cash flow.
c. Discuss the investing cash flow.
d. Discuss the financing cash flow.
e. Provide recommendations based on the data.

3. If the user requests an efficiency analysis:
a. Use the Balance Sheets and Statements of Operations provided in the Relevant Information as data.
b. Calculate and discuss asset turnover ratio.
c. Calculate and discuss inventory turnover ratio.
d. Provide recommendations based on the data.

[Relevant Information]

Statements of Operations 2020–2022:
| Function | 2020 | 2021| 2022 |
|---|---|---|---|
| Total net sales | $22,000 | $26,000 | $35,000 |
| Cost of sales | $5,000 | $5,500 | $7,000 |
| Marketing | $500 | $600 | $700 |
| Operating Expenses| $450 | $550 | $650 |
| Interest Income | $5 | $6 | $10|
| Earnings per share | $0.50 | $0.75 | $0.80 |
| Taxes | $7,000 | $7,800 | $8,900 |

Statements of Cash Flows:
| Function | 2020 | 2021| 2022 |
|---|---|---|---|
| Net Income | $16,050 | $26,000 | $35,000 |
| Taxes | $7,000 | $5,500 | $7,000 |
| Inventories | 3,000 | $600 | $700 |
| Net cash | $12,050 | $550 | $650 |
| Purchase of equipment | ($1,000) | $0 | ($250) |
| Notes payable | $2,000 | $3,000 | $3,300 |
| Bank loan | $5,000 | $0 | $0 |
| Payment on line of credit | $1,000 | $1,000 | $1,000 |

Balance Sheets:
| Function | 2020 | 2021| 2022 |
|---|---|---|---|
| Cash | $12,050 | $15,050 | $16,500 |
| Inventories | $3,000 | $600 | $700 |
| Current Assets | $15,050 | $15,650 | $17,200 |
| Accounts Payable | $8,000 | $10,000 | $15,000 |
| Current Liabilities | $8,000 | $10,000 | $15,000 |
| Shareholder Equity | $5,000 | $6,000 | $8,000 |"""

  model = "gemini-2.5-pro"
  contents = [
    types.Content(
      role="user",
      parts=[
        types.Part.from_text(text="""Please provide an income statement analysis.""")
      ]
    )
  ]

  generate_content_config = types.GenerateContentConfig(
    temperature = 1,
    top_p = 0.95,
    max_output_tokens = 65535,
    safety_settings = [types.SafetySetting(
      category="HARM_CATEGORY_HATE_SPEECH",
      threshold="OFF"
    ),types.SafetySetting(
      category="HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold="OFF"
    ),types.SafetySetting(
      category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold="OFF"
    ),types.SafetySetting(
      category="HARM_CATEGORY_HARASSMENT",
      threshold="OFF"
    )],
    system_instruction=[types.Part.from_text(text=si_text1)],
    thinking_config=types.ThinkingConfig(
      thinking_budget=-1,
    ),
  )

  for chunk in client.models.generate_content_stream(
    model = model,
    contents = contents,
    config = generate_content_config,
    ):
    print(chunk.text, end="")

if __name__ == "__main__":
    # For testing/debugging
    import json

    settings = get_settings()
    
    generate()

    
    
