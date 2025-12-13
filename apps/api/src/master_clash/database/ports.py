"""Database abstraction (ports) to enable dependency inversion.

Provides a minimal, DB-agnostic interface used by the app code, with concrete
adapters for specific backends (e.g., SQLite, Postgres/Neon).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable, Sequence
from typing import Any, Protocol


class CursorLike(Protocol):
    def execute(self, query: str, params: Sequence[Any] | None = None) -> Any: ...
    def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> Any: ...
    def fetchone(self) -> Any: ...
    def fetchall(self) -> list[Any]: ...


class Database(ABC):
    """Abstract database interface."""

    @abstractmethod
    def cursor(self) -> CursorLike:  # noqa: D401
        """Return a cursor-like object for executing queries."""

    @abstractmethod
    def execute(self, query: str, params: Sequence[Any] | None = None) -> None: ...

    @abstractmethod
    def executemany(self, query: str, seq_of_params: Iterable[Sequence[Any]]) -> None: ...

    @abstractmethod
    def fetchone(self, query: str, params: Sequence[Any] | None = None) -> Any: ...

    @abstractmethod
    def fetchall(self, query: str, params: Sequence[Any] | None = None) -> list[Any]: ...

    @abstractmethod
    def commit(self) -> None: ...

    @abstractmethod
    def close(self) -> None: ...

