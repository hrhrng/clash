"""
Database schema initialization for PostgreSQL.

This module provides database schema setup for sessions, agents, and other
application-specific tables. The LangGraph checkpoint tables are automatically
managed by PostgresSaver.
"""

from typing import Any

import psycopg
from psycopg.rows import dict_row

from master_clash.config import get_settings


async def init_postgres_schema(conn_string: str | None = None):
    """
    Initialize PostgreSQL schema for sessions, agents, and application data.

    The LangGraph checkpoint tables are automatically created by PostgresSaver.
    This function creates additional application-specific tables.

    Args:
        conn_string: PostgreSQL connection string (defaults to settings)
    """
    if conn_string is None:
        settings = get_settings()
        conn_string = settings.postgres_connection_string

    if not conn_string:
        raise ValueError("PostgreSQL connection string not configured")

    # Connect to PostgreSQL
    async with await psycopg.AsyncConnection.connect(
        conn_string, row_factory=dict_row
    ) as conn:
        async with conn.cursor() as cur:
            # Create sessions table
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    thread_id TEXT NOT NULL,
                    title TEXT,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_archived BOOLEAN DEFAULT FALSE
                )
            """)

            # Create index on user_id for faster lookups
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_user_id
                ON sessions(user_id)
            """)

            # Create index on thread_id for checkpoint correlation
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_thread_id
                ON sessions(thread_id)
            """)

            # Create agents table for tracking agent executions
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS agents (
                    id TEXT PRIMARY KEY,
                    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
                    agent_name TEXT NOT NULL,
                    agent_type TEXT,
                    status TEXT DEFAULT 'running',
                    input JSONB,
                    output JSONB,
                    error TEXT,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    duration_ms INTEGER,
                    metadata JSONB DEFAULT '{}'
                )
            """)

            # Create index on session_id for faster lookups
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agents_session_id
                ON agents(session_id)
            """)

            # Create index on agent_name for analytics
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agents_name
                ON agents(agent_name)
            """)

            # Create tool calls table for tracking tool usage
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS tool_calls (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
                    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
                    tool_name TEXT NOT NULL,
                    input JSONB,
                    output JSONB,
                    error TEXT,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    duration_ms INTEGER,
                    metadata JSONB DEFAULT '{}'
                )
            """)

            # Create index on agent_id and session_id
            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tool_calls_agent_id
                ON tool_calls(agent_id)
            """)

            await cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tool_calls_session_id
                ON tool_calls(session_id)
            """)

            # Create user preferences table
            await cur.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id TEXT PRIMARY KEY,
                    preferences JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Commit the changes
            await conn.commit()

            print("✅ PostgreSQL schema initialized successfully")
            print("   - sessions table created")
            print("   - agents table created")
            print("   - tool_calls table created")
            print("   - user_preferences table created")
            print("   - All indexes created")


def init_postgres_schema_sync(conn_string: str | None = None):
    """
    Synchronous version of init_postgres_schema.

    Args:
        conn_string: PostgreSQL connection string (defaults to settings)
    """
    if conn_string is None:
        settings = get_settings()
        conn_string = settings.postgres_connection_string

    if not conn_string:
        raise ValueError("PostgreSQL connection string not configured")

    # Connect to PostgreSQL
    with psycopg.connect(conn_string, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            # Create sessions table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    thread_id TEXT NOT NULL,
                    title TEXT,
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_archived BOOLEAN DEFAULT FALSE
                )
            """)

            # Create index on user_id for faster lookups
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_user_id
                ON sessions(user_id)
            """)

            # Create index on thread_id for checkpoint correlation
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_sessions_thread_id
                ON sessions(thread_id)
            """)

            # Create agents table for tracking agent executions
            cur.execute("""
                CREATE TABLE IF NOT EXISTS agents (
                    id TEXT PRIMARY KEY,
                    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
                    agent_name TEXT NOT NULL,
                    agent_type TEXT,
                    status TEXT DEFAULT 'running',
                    input JSONB,
                    output JSONB,
                    error TEXT,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    duration_ms INTEGER,
                    metadata JSONB DEFAULT '{}'
                )
            """)

            # Create index on session_id for faster lookups
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agents_session_id
                ON agents(session_id)
            """)

            # Create index on agent_name for analytics
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_agents_name
                ON agents(agent_name)
            """)

            # Create tool calls table for tracking tool usage
            cur.execute("""
                CREATE TABLE IF NOT EXISTS tool_calls (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
                    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
                    tool_name TEXT NOT NULL,
                    input JSONB,
                    output JSONB,
                    error TEXT,
                    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    completed_at TIMESTAMP,
                    duration_ms INTEGER,
                    metadata JSONB DEFAULT '{}'
                )
            """)

            # Create index on agent_id and session_id
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tool_calls_agent_id
                ON tool_calls(agent_id)
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_tool_calls_session_id
                ON tool_calls(session_id)
            """)

            # Create user preferences table
            cur.execute("""
                CREATE TABLE IF NOT EXISTS user_preferences (
                    user_id TEXT PRIMARY KEY,
                    preferences JSONB DEFAULT '{}',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Commit the changes
            conn.commit()

            print("✅ PostgreSQL schema initialized successfully")
            print("   - sessions table created")
            print("   - agents table created")
            print("   - tool_calls table created")
            print("   - user_preferences table created")
            print("   - All indexes created")


if __name__ == "__main__":
    """Run schema initialization when executed directly."""
    import asyncio

    print("Initializing PostgreSQL schema...")
    asyncio.run(init_postgres_schema())
