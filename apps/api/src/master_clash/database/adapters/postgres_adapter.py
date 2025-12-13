"""PostgreSQL adapter (Neon compatible) implementing the Database port.

Uses psycopg3. Expects a `postgresql://` or `postgres://` DSN in `DATABASE_URL`.
Automatically converts SQLite-style `?` placeholders into `%s` for psycopg.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from typing import Any

try:
    import psycopg
except Exception as e:  # pragma: no cover - optional dependency
    raise RuntimeError(
        "psycopg is required for Postgres support. Install optional group 'postgres'."
    ) from e

from master_clash.database.ports import CursorLike, Database


def _qmark_to_psycopg(query: str) -> str:
    """Translate SQLite `?` param style to psycopg `%s` style."""
    # naive replacement is OK when we don't mix literals with '?'
    return query.replace("?", "%s")


class _PsycopgCursorWrapper:
    def __init__(self, cursor: psycopg.Cursor):
        self._cursor = cursor

    def execute(self, query: str, params: Sequence[Any] | None = None) -> Any:
        return self._cursor.execute(_qmark_to_psycopg(query), params or [])

    def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> Any:
        return self._cursor.executemany(_qmark_to_psycopg(query), seq_of_params)

    def fetchone(self) -> Any:
        return self._cursor.fetchone()

    def fetchall(self) -> list[Any]:
        rows = self._cursor.fetchall()
        return list(rows) if rows is not None else []


class PostgresDatabase(Database):
    def __init__(self, dsn: str):
        # Enforce SSL if not specified; Neon requires SSL
        if "sslmode=" not in dsn:
            sep = "&" if "?" in dsn else "?"
            dsn = f"{dsn}{sep}sslmode=require"
        self._conn = psycopg.connect(dsn)
        self._conn.autocommit = False

    def cursor(self) -> CursorLike:  # noqa: D401
        return _PsycopgCursorWrapper(self._conn.cursor())

    def execute(self, query: str, params: Sequence[Any] | None = None) -> None:
        cur = self._conn.cursor()
        cur.execute(_qmark_to_psycopg(query), params or [])

    def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> None:
        cur = self._conn.cursor()
        cur.executemany(_qmark_to_psycopg(query), seq_of_params)

    def fetchone(self, query: str, params: Sequence[Any] | None = None) -> Any:
        cur = self._conn.cursor()
        cur.execute(_qmark_to_psycopg(query), params or [])
        return cur.fetchone()

    def fetchall(self, query: str, params: Sequence[Any] | None = None) -> list[Any]:
        cur = self._conn.cursor()
        cur.execute(_qmark_to_psycopg(query), params or [])
        rows = cur.fetchall()
        return list(rows) if rows is not None else []

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

