"""Database connection helpers for SQLite (legacy) and migration bootstrap.

This module retains the SQLite connection utility for the LangGraph SqliteSaver,
and delegates schema creation to the new migrations system (SQLite/Postgres).
"""

import sqlite3
from pathlib import Path
from typing import Optional

from master_clash.config import get_settings
from master_clash.database.di import get_database
from master_clash.database.migrator import run_migrations


def get_db_path() -> Path:
    """Get the database file path.

    Returns:
        Path to the SQLite database file
    """
    settings = get_settings()

    # If DATABASE_URL is provided, extract the path
    if settings.database_url and settings.database_url.startswith("sqlite:///"):
        db_path = settings.database_url.replace("sqlite:///", "")
        return Path(db_path)

    # Default to local data directory
    return Path("data/checkpoints.db")


def get_db_connection() -> sqlite3.Connection:
    """Get a database connection.

    Returns:
        SQLite connection object
    """
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row  # Enable column access by name
    return conn


def init_database(db_path: Optional[Path] = None) -> None:
    """Initialize schema via migrations (SQLite or Postgres).

    For backward compatibility, if `db_path` is passed we ensure the SQLite
    file exists; otherwise, the active `DATABASE_URL` determines the dialect.
    """
    settings = get_settings()
    database_url = settings.database_url or "sqlite:///./data/checkpoints.db"

    # Backward-compat: ensure sqlite file exists when specified
    if database_url.startswith("sqlite:///"):
        path = db_path or get_db_path()
        path.parent.mkdir(parents=True, exist_ok=True)

    # Resolve dialect for migrations (D1 uses SQLite dialect)
    if database_url.startswith("sqlite") or database_url.startswith("d1://"):
        dialect = "sqlite"
    else:
        dialect = "postgres"

    db = get_database()
    applied = run_migrations(db, dialect)
    db.close()

    location = str(db_path or get_db_path()) if dialect == "sqlite" else database_url
    if applied:
        print(f"Applied migrations ({dialect}): {', '.join(applied)}")
    print(f"Database initialized at: {location}")


if __name__ == "__main__":
    # Initialize database when run directly
    init_database()
