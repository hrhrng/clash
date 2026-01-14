"""
PostgreSQL Checkpointer for LangGraph using Neon.

This module provides checkpoint storage for LangGraph workflows using
PostgreSQL (Neon serverless) for better reliability and official support.
"""

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from master_clash.config import get_settings


# Global async connection pool
_async_pool: AsyncConnectionPool | None = None


async def get_async_connection_pool() -> AsyncConnectionPool:
    """Get or create the global async PostgreSQL connection pool."""
    global _async_pool

    if _async_pool is None:
        settings = get_settings()
        if not settings.postgres_connection_string:
            raise ValueError("PostgreSQL connection string not configured. Set POSTGRES_CONNECTION_STRING in .env")

        _async_pool = AsyncConnectionPool(
            conninfo=settings.postgres_connection_string,
            max_size=10,
            kwargs={
                "autocommit": True,
                "prepare_threshold": 0,
            },
        )

    return _async_pool


async def get_async_checkpointer(initialize: bool = True) -> AsyncPostgresSaver:
    """
    Get an async LangGraph checkpointer configured for PostgreSQL.

    Args:
        initialize: Whether to initialize the database schema (AsyncPostgresSaver does this automatically)

    Returns:
        Configured async checkpoint saver instance
    """
    pool = await get_async_connection_pool()

    # Create the async checkpointer
    checkpointer = AsyncPostgresSaver(pool)

    # Setup tables (this is safe to call multiple times)
    if initialize:
        await checkpointer.setup()

    return checkpointer


def get_checkpointer(initialize: bool = True):
    """
    Synchronous version not recommended - use get_async_checkpointer instead.

    Raises:
        NotImplementedError: Always raises since async is required
    """
    raise NotImplementedError(
        "Synchronous PostgreSQL checkpointer is not supported. "
        "Use get_async_checkpointer() instead for async workflows."
    )


async def close_connection_pool():
    """Close the global async connection pool."""
    global _async_pool
    if _async_pool:
        await _async_pool.close()
        _async_pool = None

