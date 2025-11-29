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


if __name__ == "__main__":
    # For testing/debugging
    import json

    settings = get_settings()
    print("Current Settings:")
    print(f"  Environment: {settings.environment}")
    print(f"  Debug: {settings.debug}")
    print(f"  OpenAI API Key: {'***' + settings.openai_api_key[-4:] if settings.openai_api_key else 'Not set'}")
    print(f"  Output Dir: {settings.output_dir}")
    print(f"  Assets Dir: {settings.assets_dir}")
    print(f"  Max Workers: {settings.max_workers}")
    print(f"  Log Level: {settings.log_level}")
