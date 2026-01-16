"""LangGraph checkpoint implementation using PostgreSQL/SQLite/D1.

This module provides checkpoint storage for LangGraph workflows,
enabling state persistence, recovery, and time-travel debugging.

Priority: PostgreSQL > D1 > SQLite
"""


import logging

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.sqlite import SqliteSaver

from master_clash.config import get_settings
from master_clash.database.connection import get_db_connection, get_db_path, init_database

logger = logging.getLogger(__name__)

def get_checkpointer(initialize: bool = True) -> BaseCheckpointSaver:
    """Get a LangGraph checkpointer configured for PostgreSQL/SQLite/D1.

    Priority order:
    1. PostgreSQL (Neon) - if POSTGRES_CONNECTION_STRING is set
    2. D1 (Cloudflare) - if D1 credentials are set
    3. SQLite (local) - fallback

    Args:
        initialize: Whether to initialize the database schema if not exists

    Returns:
        Configured checkpoint saver instance
    """
    settings = get_settings()

    # Priority 1: PostgreSQL (Neon)
    if settings.use_postgres_checkpointer:
        from master_clash.database.pg_checkpointer import get_checkpointer as get_pg_checkpointer
        return get_pg_checkpointer(initialize)

    # Priority 2: D1 (Cloudflare) - DEPRECATED
    if settings.use_d1_checkpointer:
        from master_clash.database.d1_checkpointer import D1Checkpointer
        return D1Checkpointer(
            account_id=settings.cloudflare_account_id,
            database_id=settings.cloudflare_d1_database_id,
            api_token=settings.cloudflare_api_token,
        )

    # Priority 3: SQLite (local fallback)
    db_path = get_db_path()

    if initialize:
        init_database(db_path)

    # SqliteSaver expects a connection
    conn = get_db_connection()

    # Create the checkpointer with the connection
    # Note: SqliteSaver will manage its own tables (checkpoints, writes)
    checkpointer = SqliteSaver(conn)

    return checkpointer


async def get_async_checkpointer(initialize: bool = True) -> BaseCheckpointSaver:
    """Get an async LangGraph checkpointer configured for PostgreSQL/SQLite/D1.

    Priority order:
    1. PostgreSQL (Neon) - if POSTGRES_CONNECTION_STRING is set
    2. D1 (Cloudflare) - if D1 credentials are set
    3. SQLite (local) - fallback

    For async workflows, this uses aiosqlite for non-blocking I/O.

    Args:
        initialize: Whether to initialize the database schema if not exists

    Returns:
        Configured async checkpoint saver instance
    """
    settings = get_settings()

    # Priority 1: PostgreSQL (Neon)
    if settings.use_postgres_checkpointer:
        from master_clash.database.pg_checkpointer import get_async_checkpointer as get_async_pg_checkpointer
        try:
            return await get_async_pg_checkpointer(initialize)
        except Exception as exc:
            if settings.is_production:
                raise
            logger.warning(
                "PostgreSQL checkpointer unavailable; falling back to non-PostgreSQL checkpointer.",
                exc_info=exc,
            )

    # Priority 2: D1 (Cloudflare) - DEPRECATED
    if settings.use_d1_checkpointer:
        from master_clash.database.d1_checkpointer import D1Checkpointer
        return D1Checkpointer(
            account_id=settings.cloudflare_account_id,
            database_id=settings.cloudflare_d1_database_id,
            api_token=settings.cloudflare_api_token,
        )

    # Priority 3: SQLite (local fallback)
    import aiosqlite

    db_path = get_db_path()

    if initialize:
        init_database(db_path)

    # Create async connection
    conn = await aiosqlite.connect(str(db_path))
    conn.row_factory = aiosqlite.Row

    # SqliteSaver can work with async connections
    checkpointer = SqliteSaver(conn)

    return checkpointer


def checkpoint_exists(
    checkpointer: SqliteSaver, thread_id: str, checkpoint_ns: str | None = None
) -> bool:
    """Check if a checkpoint exists for a given thread.

    Args:
        checkpointer: The checkpointer instance
        thread_id: The thread/run ID to check
        checkpoint_ns: Optional namespace for the checkpoint

    Returns:
        True if checkpoint exists, False otherwise
    """
    try:
        # Try to get the latest checkpoint for this thread
        config = {"configurable": {"thread_id": thread_id}}
        if checkpoint_ns:
            config["configurable"]["checkpoint_ns"] = checkpoint_ns

        checkpoint = checkpointer.get(config)
        return checkpoint is not None
    except Exception:
        return False


def list_checkpoints(checkpointer: SqliteSaver, thread_id: str) -> list[dict]:
    """List all checkpoints for a given thread.

    Args:
        checkpointer: The checkpointer instance
        thread_id: The thread/run ID

    Returns:
        List of checkpoint metadata dictionaries
    """
    config = {"configurable": {"thread_id": thread_id}}

    checkpoints = []
    for checkpoint in checkpointer.list(config):
        checkpoints.append(
            {
                "checkpoint_id": checkpoint.id,
                "parent_checkpoint_id": checkpoint.parent_checkpoint_id,
                "checkpoint_ns": checkpoint.checkpoint_ns,
                "metadata": checkpoint.metadata,
            }
        )

    return checkpoints
