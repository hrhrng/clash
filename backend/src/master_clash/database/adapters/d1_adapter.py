"""Cloudflare D1 adapter implementing the Database port via Admin API.

This adapter uses Cloudflare's Account-level D1 Admin API to run SQL queries.
It is intended for controlled server-side usage (migrations/ops), not hot-paths.

Environment variables required:
- CF_API_TOKEN: Cloudflare API token with D1 edit permissions
- CF_ACCOUNT_ID: Cloudflare account ID
- D1_DATABASE_ID: D1 database UUID

`DATABASE_URL` format in .env:
    d1://<database-name>
The adapter reads the env for account and database IDs; the name is informational.
"""

from __future__ import annotations

import os
from typing import Any, Iterable, Sequence

import requests

from master_clash.database.ports import CursorLike, Database


class _ResultBufferCursor(CursorLike):
    def __init__(self) -> None:
        self._rows: list[Any] = []
        self._pos = 0

    def load(self, rows: list[Any]) -> None:
        self._rows = rows or []
        self._pos = 0

    def execute(self, query: str, params: Sequence[Any] | None = None) -> Any:  # pragma: no cover - not used directly
        raise NotImplementedError

    def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> Any:  # pragma: no cover
        raise NotImplementedError

    def fetchone(self) -> Any:
        if self._pos >= len(self._rows):
            return None
        row = self._rows[self._pos]
        self._pos += 1
        return row

    def fetchall(self) -> list[Any]:
        return list(self._rows)


class D1Database(Database):
    BASE = "https://api.cloudflare.com/client/v4"

    def __init__(self, database_name: str):
        self._account_id = os.getenv("CF_ACCOUNT_ID")
        self._token = os.getenv("CF_API_TOKEN")
        self._db_id = os.getenv("D1_DATABASE_ID")
        self._database_name = database_name

        if not (self._account_id and self._token and self._db_id):
            raise RuntimeError(
                "Missing Cloudflare D1 environment. Require CF_ACCOUNT_ID, CF_API_TOKEN, D1_DATABASE_ID"
            )

        self._cursor = _ResultBufferCursor()

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

    def _endpoint(self) -> str:
        return f"{self.BASE}/accounts/{self._account_id}/d1/database/{self._db_id}/query"

    def _post(self, sql: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
        # Cloudflare D1 API expects a single statement object
        payload = {"sql": sql, "params": list(params or [])}
        r = requests.post(self._endpoint(), json=payload, headers=self._headers())
        r.raise_for_status()
        data = r.json()
        if not data.get("success", False):
            raise RuntimeError(f"D1 query failed: {data}")
        # Admin API returns {result: [{results: [...], success: true}], success: true}
        resultsets = data.get("result")
        if isinstance(resultsets, list) and resultsets:
            rows = resultsets[0].get("results") or []
        else:
            rows = []
        return rows

    def cursor(self) -> CursorLike:  # noqa: D401
        return self._cursor

    def execute(self, query: str, params: Sequence[Any] | None = None) -> None:
        rows = self._post(query, params)
        self._cursor.load(rows)

    def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> None:
        for p in seq_of_params:
            self.execute(query, p)

    def fetchone(self, query: str, params: Sequence[Any] | None = None) -> Any:
        rows = self._post(query, params)
        return rows[0] if rows else None

    def fetchall(self, query: str, params: Sequence[Any] | None = None) -> list[Any]:
        rows = self._post(query, params)
        return list(rows)

    def commit(self) -> None:
        # D1 Admin API is auto-commit per request
        pass

    def close(self) -> None:
        pass

