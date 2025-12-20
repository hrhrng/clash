"""
Lightweight config loader.

- Loads environment variables from .env at module import.
- Provides a simple Settings wrapper around os.environ with sane defaults.
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env once (workspace root .env)
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def _env(key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, default)


def _env_bool(key: str, default: bool = False) -> bool:
    val = os.environ.get(key)
    if val is None:
        return default
    return val.lower() in {"1", "true", "yes", "on"}


def _env_int(key: str, default: int) -> int:
    val = os.environ.get(key)
    if val is None:
        return default
    try:
        return int(val)
    except ValueError:
        return default


def _env_list(key: str, default: list[str] | None = None, sep: str = ",") -> list[str]:
    val = os.environ.get(key)
    if val is None:
        return default or []
    return [item.strip() for item in val.split(sep) if item.strip()]


def _env_path(key: str, default: str | Path) -> Path:
    val = os.environ.get(key)
    return Path(val) if val else Path(default)


class Settings:
    """Thin wrapper over os.environ with defaults and helpers."""

    def __init__(self) -> None:
        # App
        self.app_name: str = _env("APP_NAME", "master-clash") or "master-clash"
        self.environment: str = _env("ENVIRONMENT", "development") or "development"
        self.debug: bool = _env_bool("DEBUG", False)

        # API keys
        self.openai_api_key: str | None = _env("OPENAI_API_KEY")
        self.google_api_key: str | None = _env("GOOGLE_API_KEY")
        self.google_cloud_api_key: str | None = _env("GOOGLE_CLOUD_API_KEY")
        self.google_vertex_base_url: str | None = _env("GOOGLE_VERTEX_BASE_URL")
        self.anthropic_api_key: str | None = _env("ANTHROPIC_API_KEY")
        self.replicate_api_key: str | None = _env("REPLICATE_API_KEY")
        self.stability_api_key: str | None = _env("STABILITY_API_KEY")
        self.kie_api_key: str | None = _env("KIE_API_KEY")

        # Google AI Studio
        self.google_ai_studio_base_url: str | None = _env("GOOGLE_AI_STUDIO_BASE_URL")

        # Database
        self.database_url: str | None = _env("DATABASE_URL")

        # Storage
        self.output_dir: Path = _env_path("OUTPUT_DIR", "./output")
        self.assets_dir: Path = _env_path("ASSETS_DIR", "./assets")

        # AWS
        self.aws_access_key_id: str | None = _env("AWS_ACCESS_KEY_ID")
        self.aws_secret_access_key: str | None = _env("AWS_SECRET_ACCESS_KEY")
        self.aws_s3_bucket: str | None = _env("AWS_S3_BUCKET")
        self.aws_region: str = _env("AWS_REGION", "us-east-1") or "us-east-1"

        # Cloudflare R2
        self.r2_account_id: str | None = _env("R2_ACCOUNT_ID")
        self.r2_access_key_id: str | None = _env("R2_ACCESS_KEY_ID")
        self.r2_secret_access_key: str | None = _env("R2_SECRET_ACCESS_KEY")
        self.r2_bucket_name: str | None = _env("R2_BUCKET_NAME")
        self.r2_public_url: str | None = _env("R2_PUBLIC_URL")

        # Cloudflare D1 (checkpointer)
        self.cloudflare_account_id: str | None = _env("CLOUDFLARE_ACCOUNT_ID")
        self.cloudflare_d1_database_id: str | None = _env("CLOUDFLARE_D1_DATABASE_ID")
        self.cloudflare_api_token: str | None = _env("CLOUDFLARE_API_TOKEN")

        # Loro Sync Server
        self.loro_sync_url: str | None = _env("LORO_SYNC_URL", "ws://localhost:8787")

        # App behavior
        self.max_workers: int = _env_int("MAX_WORKERS", 4)
        self.log_level: str = _env("LOG_LEVEL", "INFO") or "INFO"
        self.redis_url: str | None = _env("REDIS_URL")
        self.sentry_dsn: str | None = _env("SENTRY_DSN")
        self.secret_key: str | None = _env("SECRET_KEY")
        self.allowed_hosts: list[str] = _env_list("ALLOWED_HOSTS", ["localhost", "127.0.0.1"])
        self.enable_cache: bool = _env_bool("ENABLE_CACHE", True)
        self.enable_telemetry: bool = _env_bool("ENABLE_TELEMETRY", False)

    # Derived helpers
    @property
    def r2_endpoint(self) -> str | None:
        if self.r2_account_id:
            return f"https://{self.r2_account_id}.r2.cloudflarestorage.com"
        return None

    @property
    def use_d1_checkpointer(self) -> bool:
        return bool(
            self.cloudflare_account_id
            and self.cloudflare_d1_database_id
            and self.cloudflare_api_token
        )

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def is_staging(self) -> bool:
        return self.environment == "staging"

    def ensure_directories(self) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.assets_dir.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    return Settings()
