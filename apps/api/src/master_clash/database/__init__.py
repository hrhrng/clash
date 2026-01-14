"""Database module for Master Clash.

Provides DB connection abstractions and checkpoint utilities.

Note: `get_checkpointer` is imported lazily to avoid requiring `langgraph`
unless explicitly used.
"""

from __future__ import annotations

from typing import Any

from master_clash.database.connection import get_db_connection, init_database
from master_clash.database.di import get_database


def get_checkpointer(*args: Any, **kwargs: Any):  # lazy import to avoid hard dependency at import time
    from master_clash.database.checkpointer import get_checkpointer as _get

    return _get(*args, **kwargs)


async def get_async_checkpointer(*args: Any, **kwargs: Any):  # lazy import for async version
    from master_clash.database.checkpointer import get_async_checkpointer as _get_async

    return await _get_async(*args, **kwargs)


__all__ = ["get_checkpointer", "get_async_checkpointer", "get_db_connection", "init_database", "get_database"]
