"""SQLite adapter implementing the Database port."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

from master_clash.database.ports import CursorLike, Database


class _SQLiteCursorWrapper:
    def __init__(self, cursor: sqlite3.Cursor):
        self._cursor = cursor

    def execute(self, query: str, params: Sequence[Any] | None = None) -> Any:  # noqa: D401
        return self._cursor.execute(query, params or [])

    def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> Any:
        return self._cursor.executemany(query, seq_of_params)

    def fetchone(self) -> Any:
        return self._cursor.fetchone()

    def fetchall(self) -> list[Any]:
        return self._cursor.fetchall()


class SQLiteDatabase(Database):
    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path))
        self._conn.row_factory = sqlite3.Row

    def cursor(self) -> CursorLike:  # noqa: D401
        return _SQLiteCursorWrapper(self._conn.cursor())

    def execute(self, query: str, params: Sequence[Any] | None = None) -> None:
        cur = self._conn.cursor()
        cur.execute(query, params or [])

    def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> None:
        cur = self._conn.cursor()
        cur.executemany(query, seq_of_params)

    def fetchone(self, query: str, params: Sequence[Any] | None = None) -> Any:
        cur = self._conn.cursor()
        cur.execute(query, params or [])
        return cur.fetchone()

    def fetchall(self, query: str, params: Sequence[Any] | None = None) -> list[Any]:
        cur = self._conn.cursor()
        cur.execute(query, params or [])
        return list(cur.fetchall())

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

