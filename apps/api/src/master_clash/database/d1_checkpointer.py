"""
Cloudflare D1 Checkpointer for LangGraph.

Stores workflow checkpoint state in Cloudflare D1 database via HTTP API.
"""

import json
from collections.abc import Sequence
from typing import Any

import httpx
from langgraph.checkpoint.base import (
    BaseCheckpointSaver,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
)


class D1Checkpointer(BaseCheckpointSaver):
    """
    LangGraph checkpointer using Cloudflare D1.

    Accesses D1 via Cloudflare's HTTP API.
    """

    def __init__(
        self,
        account_id: str,
        database_id: str,
        api_token: str,
    ):
        """
        Initialize D1 checkpointer.

        Args:
            account_id: Cloudflare account ID
            database_id: D1 database ID
            api_token: Cloudflare API token with D1 edit permissions
        """
        super().__init__()
        self.account_id = account_id
        self.database_id = database_id
        self.api_token = api_token
        self.base_url = (
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
            f"/d1/database/{database_id}/query"
        )

    def _execute_sql(self, sql: str, params: list | None = None) -> dict[str, Any]:
        """
        Execute SQL on D1 via HTTP API (synchronous).

        Args:
            sql: SQL query
            params: Query parameters

        Returns:
            Response from D1 API
        """
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

        payload = {"sql": sql, "params": params or []}

        response = httpx.post(self.base_url, headers=headers, json=payload, timeout=30.0)
        response.raise_for_status()

        result = response.json()
        if not result.get("success"):
            errors = result.get("errors", [])
            raise Exception(f"D1 query failed: {errors}")

        return result

    async def _aexecute_sql(
        self, sql: str, params: list | None = None
    ) -> dict[str, Any]:
        """
        Execute SQL on D1 via HTTP API (async).

        Args:
            sql: SQL query
            params: Query parameters

        Returns:
            Response from D1 API
        """
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

        payload = {"sql": sql, "params": params or []}

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.base_url, headers=headers, json=payload, timeout=30.0
            )
            response.raise_for_status()

            result = response.json()
            if not result.get("success"):
                errors = result.get("errors", [])
                raise Exception(f"D1 query failed: {errors}")

            return result

    def put(
        self,
        config: dict,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: dict,
    ) -> dict:
        """
        Save checkpoint to D1 (sync).

        Args:
            config: Checkpoint configuration
            checkpoint: Checkpoint data
            metadata: Checkpoint metadata
            new_versions: New version info

        Returns:
            Updated config
        """
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = checkpoint["id"]
        parent_id = config["configurable"].get("checkpoint_id")

        # Serialize checkpoint and metadata
        checkpoint_blob = json.dumps(checkpoint).encode("utf-8")
        metadata_blob = json.dumps(metadata).encode("utf-8")

        # Insert/update checkpoint
        sql = """
        INSERT INTO checkpoints (
            thread_id, checkpoint_ns, checkpoint_id,
            parent_checkpoint_id, checkpoint, metadata
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, checkpoint_ns, checkpoint_id)
        DO UPDATE SET
            checkpoint = excluded.checkpoint,
            metadata = excluded.metadata
        """

        self._execute_sql(
            sql,
            [
                thread_id,
                checkpoint_ns,
                checkpoint_id,
                parent_id,
                checkpoint_blob.hex(),  # Store as hex string for D1
                metadata_blob.hex(),
            ],
        )

        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint_id,
            }
        }

    async def aput(
        self,
        config: dict,
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata,
        new_versions: dict,
    ) -> dict:
        """Save checkpoint to D1 (async)."""
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = checkpoint["id"]
        parent_id = config["configurable"].get("checkpoint_id")

        checkpoint_blob = json.dumps(checkpoint).encode("utf-8")
        metadata_blob = json.dumps(metadata).encode("utf-8")

        sql = """
        INSERT INTO checkpoints (
            thread_id, checkpoint_ns, checkpoint_id,
            parent_checkpoint_id, checkpoint, metadata
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, checkpoint_ns, checkpoint_id)
        DO UPDATE SET
            checkpoint = excluded.checkpoint,
            metadata = excluded.metadata
        """

        await self._aexecute_sql(
            sql,
            [
                thread_id,
                checkpoint_ns,
                checkpoint_id,
                parent_id,
                checkpoint_blob.hex(),
                metadata_blob.hex(),
            ],
        )

        return {
            "configurable": {
                "thread_id": thread_id,
                "checkpoint_ns": checkpoint_ns,
                "checkpoint_id": checkpoint_id,
            }
        }

    def get_tuple(self, config: dict) -> CheckpointTuple | None:
        """
        Load checkpoint from D1 (sync).

        Args:
            config: Checkpoint configuration

        Returns:
            CheckpointTuple if found, None otherwise
        """
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"].get("checkpoint_id")

        if checkpoint_id:
            # Load specific checkpoint
            sql = """
            SELECT checkpoint, metadata, parent_checkpoint_id
            FROM checkpoints
            WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
            """
            params = [thread_id, checkpoint_ns, checkpoint_id]
        else:
            # Load latest checkpoint
            sql = """
            SELECT checkpoint, metadata, parent_checkpoint_id, checkpoint_id
            FROM checkpoints
            WHERE thread_id = ? AND checkpoint_ns = ?
            ORDER BY checkpoint_id DESC
            LIMIT 1
            """
            params = [thread_id, checkpoint_ns]

        result = self._execute_sql(sql, params)
        rows = result.get("result", [{}])[0].get("results", [])

        if not rows:
            return None

        row = rows[0]
        checkpoint_data = bytes.fromhex(row["checkpoint"])
        metadata_data = bytes.fromhex(row["metadata"])

        checkpoint = json.loads(checkpoint_data)
        metadata = json.loads(metadata_data)

        return CheckpointTuple(
            config={
                "configurable": {
                    "thread_id": thread_id,
                    "checkpoint_ns": checkpoint_ns,
                    "checkpoint_id": row.get("checkpoint_id", checkpoint_id),
                }
            },
            checkpoint=checkpoint,
            metadata=metadata,
            parent_config=(
                {
                    "configurable": {
                        "thread_id": thread_id,
                        "checkpoint_ns": checkpoint_ns,
                        "checkpoint_id": row["parent_checkpoint_id"],
                    }
                }
                if row.get("parent_checkpoint_id")
                else None
            ),
        )

    async def aget_tuple(self, config: dict) -> CheckpointTuple | None:
        """Load checkpoint from D1 (async)."""
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"].get("checkpoint_id")

        if checkpoint_id:
            sql = """
            SELECT checkpoint, metadata, parent_checkpoint_id
            FROM checkpoints
            WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
            """
            params = [thread_id, checkpoint_ns, checkpoint_id]
        else:
            sql = """
            SELECT checkpoint, metadata, parent_checkpoint_id, checkpoint_id
            FROM checkpoints
            WHERE thread_id = ? AND checkpoint_ns = ?
            ORDER BY checkpoint_id DESC
            LIMIT 1
            """
            params = [thread_id, checkpoint_ns]

        result = await self._aexecute_sql(sql, params)
        rows = result.get("result", [{}])[0].get("results", [])

        if not rows:
            return None

        row = rows[0]
        checkpoint_data = bytes.fromhex(row["checkpoint"])
        metadata_data = bytes.fromhex(row["metadata"])

        checkpoint = json.loads(checkpoint_data)
        metadata = json.loads(metadata_data)

        return CheckpointTuple(
            config={
                "configurable": {
                    "thread_id": thread_id,
                    "checkpoint_ns": checkpoint_ns,
                    "checkpoint_id": row.get("checkpoint_id", checkpoint_id),
                }
            },
            checkpoint=checkpoint,
            metadata=metadata,
            parent_config=(
                {
                    "configurable": {
                        "thread_id": thread_id,
                        "checkpoint_ns": checkpoint_ns,
                        "checkpoint_id": row["parent_checkpoint_id"],
                    }
                }
                if row.get("parent_checkpoint_id")
                else None
            ),
        )

    def list(
        self, config: dict, *, filter: dict | None = None, before: dict | None = None, limit: int | None = None
    ) -> Sequence[CheckpointTuple]:
        """List checkpoints (sync)."""
        # Basic implementation - can be enhanced
        return []

    async def alist(
        self, config: dict, *, filter: dict | None = None, before: dict | None = None, limit: int | None = None
    ) -> Sequence[CheckpointTuple]:
        """List checkpoints (async)."""
        return []
