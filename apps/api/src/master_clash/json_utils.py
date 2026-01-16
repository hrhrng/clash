"""Shared JSON serialization helpers."""

from __future__ import annotations

import dataclasses
import datetime as dt
import json
import logging
from decimal import Decimal
from typing import Any
from uuid import UUID

from langchain_core.load import dumpd
from langchain_core.messages import BaseMessage

logger = logging.getLogger(__name__)


class UnifiedJSONEncoder(json.JSONEncoder):
    """JSON encoder that handles common domain objects safely."""

    def default(self, obj: Any) -> Any:
        if isinstance(obj, BaseMessage):
            try:
                return dumpd(obj)
            except Exception as exc:
                logger.warning("Failed to serialize BaseMessage with dumpd: %s", exc)
                return {
                    "type": getattr(obj, "type", "message"),
                    "content": str(getattr(obj, "content", "")),
                }

        if dataclasses.is_dataclass(obj):
            return dataclasses.asdict(obj)

        if isinstance(obj, (dt.datetime, dt.date, dt.time)):
            return obj.isoformat()

        if isinstance(obj, UUID):
            return str(obj)

        if isinstance(obj, Decimal):
            return float(obj)

        if isinstance(obj, (set, frozenset, tuple)):
            return list(obj)

        if hasattr(obj, "model_dump") and callable(obj.model_dump):
            try:
                return obj.model_dump()
            except Exception:
                pass

        if hasattr(obj, "dict") and callable(obj.dict):
            try:
                return obj.dict()
            except Exception:
                pass

        if isinstance(obj, bytes):
            try:
                return obj.decode("utf-8")
            except Exception:
                return obj.hex()

        return super().default(obj)


def dumps(value: Any, *, indent: int | None = None, sort_keys: bool = False) -> str:
    """Serialize to JSON using the shared encoder."""
    return json.dumps(
        value,
        cls=UnifiedJSONEncoder,
        indent=indent,
        sort_keys=sort_keys,
    )


def dumpb(
    value: Any,
    *,
    indent: int | None = None,
    sort_keys: bool = False,
    encoding: str = "utf-8",
) -> bytes:
    """Serialize to JSON bytes using the shared encoder."""
    return dumps(value, indent=indent, sort_keys=sort_keys).encode(encoding)


def loads(payload: str | bytes | bytearray) -> Any:
    """Deserialize JSON payload."""
    if isinstance(payload, (bytes, bytearray)):
        payload = payload.decode("utf-8")
    return json.loads(payload)
