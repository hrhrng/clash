"""Database dependency resolver.

Selects the proper adapter based on `DATABASE_URL`.
Supported schemes:
- sqlite:///path/to.db
- postgres://... or postgresql://... (Neon compatible)
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import urlparse

from master_clash.config import get_settings
from master_clash.database.ports import Database


def _sqlite_path_from_url(url: str) -> Path:
    # sqlite:///absolute/or/relative
    path = url.replace("sqlite:///", "")
    return Path(path)


def get_database() -> Database:
    settings = get_settings()
    # Use absolute path to avoid ambiguity between API and CLI
    url = settings.database_url or "sqlite:////Users/xiaoyang/Proj/clash/apps/api/data/checkpoints.db"

    parsed = urlparse(url)
    scheme = parsed.scheme.lower()

    if scheme == "sqlite":
        from master_clash.database.adapters.sqlite_adapter import SQLiteDatabase

        return SQLiteDatabase(_sqlite_path_from_url(url))
    if scheme in ("postgres", "postgresql"):
        from master_clash.database.adapters.postgres_adapter import PostgresDatabase

        return PostgresDatabase(url)
    if scheme == "d1":
        # Expect env: CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID
        from master_clash.database.adapters.d1_adapter import D1Database

        dbname = parsed.netloc or parsed.path.lstrip("/") or "default"
        return D1Database(dbname)

    raise ValueError(f"Unsupported DATABASE_URL scheme: {scheme}")
