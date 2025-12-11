"""Checkpoint metadata tracking.

This module provides utilities for tracking costs, timing, and API calls
associated with workflow checkpoints.
"""

import json
import time
from contextlib import contextmanager
from typing import Any

from master_clash.database.di import get_database
from master_clash.database.ports import Database


class MetadataTracker:
    """Track workflow execution metadata."""

    def __init__(self, run_id: str):
        """Initialize metadata tracker.

        Args:
            run_id: Workflow run identifier
        """
        self.run_id = run_id
        self.db: Database = get_database()

    def start_workflow(self, workflow_name: str, metadata: dict[str, Any] | None = None) -> None:
        """Record workflow start.

        Args:
            workflow_name: Name of the workflow
            metadata: Additional metadata to store
        """
        self.db.execute(
            """
            INSERT INTO workflow_executions (run_id, workflow_name, status, metadata)
            VALUES (?, ?, 'running', ?)
            ON CONFLICT(run_id) DO UPDATE SET
                workflow_name = excluded.workflow_name,
                status = 'running',
                metadata = excluded.metadata,
                updated_at = CURRENT_TIMESTAMP
        """,
            (self.run_id, workflow_name, json.dumps(metadata or {})),
        )
        self.db.commit()

    def update_workflow_status(
        self, status: str, total_cost: float | None = None, end_time: str | None = None
    ) -> None:
        """Update workflow status.

        Args:
            status: New status (running, completed, failed, etc.)
            total_cost: Total cost incurred (optional)
            end_time: End timestamp (optional)
        """
        if total_cost is not None and end_time is not None:
            self.db.execute(
                """
                UPDATE workflow_executions
                SET status = ?, total_cost = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
                WHERE run_id = ?
            """,
                (status, total_cost, end_time, self.run_id),
            )
        elif total_cost is not None:
            self.db.execute(
                """
                UPDATE workflow_executions
                SET status = ?, total_cost = ?, updated_at = CURRENT_TIMESTAMP
                WHERE run_id = ?
            """,
                (status, total_cost, self.run_id),
            )
        elif end_time is not None:
            self.db.execute(
                """
                UPDATE workflow_executions
                SET status = ?, end_time = ?, updated_at = CURRENT_TIMESTAMP
                WHERE run_id = ?
            """,
                (status, end_time, self.run_id),
            )
        else:
            self.db.execute(
                """
                UPDATE workflow_executions
                SET status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE run_id = ?
            """,
                (status, self.run_id),
            )

        self.db.commit()

    def record_checkpoint(
        self,
        checkpoint_ns: str,
        checkpoint_id: str,
        step_name: str,
        step_index: int,
        execution_time_ms: int,
        api_calls: int = 0,
        total_cost: float = 0.0,
        error_message: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Record checkpoint metadata.

        Args:
            checkpoint_ns: Checkpoint namespace
            checkpoint_id: Checkpoint identifier
            step_name: Name of the workflow step
            step_index: Index of the step
            execution_time_ms: Execution time in milliseconds
            api_calls: Number of API calls made
            total_cost: Cost incurred
            error_message: Error message if failed
            metadata: Additional metadata
        """
        self.db.execute(
            """
            INSERT INTO checkpoint_metadata
            (checkpoint_ns, checkpoint_id, step_name, step_index, execution_time_ms,
             api_calls, total_cost, error_message, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(checkpoint_ns, checkpoint_id) DO UPDATE SET
                step_name = excluded.step_name,
                step_index = excluded.step_index,
                execution_time_ms = excluded.execution_time_ms,
                api_calls = excluded.api_calls,
                total_cost = excluded.total_cost,
                error_message = excluded.error_message,
                metadata = excluded.metadata
        """,
            (
                checkpoint_ns,
                checkpoint_id,
                step_name,
                step_index,
                execution_time_ms,
                api_calls,
                total_cost,
                error_message,
                json.dumps(metadata or {}),
            ),
        )
        self.db.commit()

    def record_asset(
        self,
        asset_type: str,
        asset_path: str,
        checkpoint_id: str | None = None,
        asset_url: str | None = None,
        generation_params: dict[str, Any] | None = None,
        cost: float = 0.0,
        duration_ms: int | None = None,
    ) -> None:
        """Record generated asset.

        Args:
            asset_type: Type of asset (screenplay, character_image, location_image, video)
            asset_path: Local file path
            checkpoint_id: Associated checkpoint ID
            asset_url: Remote URL if applicable
            generation_params: Parameters used for generation
            cost: Generation cost
            duration_ms: Generation duration
        """
        self.db.execute(
            """
            INSERT INTO generated_assets
            (run_id, checkpoint_id, asset_type, asset_path, asset_url,
             generation_params, cost, duration_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                self.run_id,
                checkpoint_id,
                asset_type,
                asset_path,
                asset_url,
                json.dumps(generation_params or {}),
                cost,
                duration_ms,
            ),
        )
        self.db.commit()

    def record_api_call(
        self,
        service: str,
        endpoint: str | None = None,
        checkpoint_id: str | None = None,
        request_params: dict[str, Any] | None = None,
        response_data: dict[str, Any] | None = None,
        status_code: int | None = None,
        cost: float = 0.0,
        duration_ms: int | None = None,
        error_message: str | None = None,
    ) -> None:
        """Record API call.

        Args:
            service: Service name (openai, google, kling, etc.)
            endpoint: API endpoint
            checkpoint_id: Associated checkpoint ID
            request_params: Request parameters (will be JSON serialized)
            response_data: Response data (will be JSON serialized)
            status_code: HTTP status code
            cost: API call cost
            duration_ms: API call duration
            error_message: Error message if failed
        """
        self.db.execute(
            """
            INSERT INTO api_logs
            (run_id, checkpoint_id, service, endpoint, request_params, response_data,
             status_code, cost, duration_ms, error_message)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                self.run_id,
                checkpoint_id,
                service,
                endpoint,
                json.dumps(request_params or {}),
                json.dumps(response_data or {}) if response_data else None,
                status_code,
                cost,
                duration_ms,
                error_message,
            ),
        )
        self.db.commit()

    def get_workflow_stats(self) -> dict[str, Any]:
        """Get workflow execution statistics.

        Returns:
            Dictionary containing workflow statistics
        """
        # Get workflow info
        row = self.db.fetchone(
            """
            SELECT workflow_name, status, start_time, end_time, total_cost, metadata
            FROM workflow_executions
            WHERE run_id = ?
        """,
            (self.run_id,),
        )

        if not row:
            return {}

        if isinstance(row, dict):
            workflow_name = row.get("workflow_name")
            status = row.get("status")
            start_time = row.get("start_time")
            end_time = row.get("end_time")
            total_cost = row.get("total_cost")
            metadata = row.get("metadata")
        else:
            workflow_name, status, start_time, end_time, total_cost, metadata = row

        # Get checkpoint count
        ck_row = self.db.fetchone(
            """
            SELECT COUNT(*) FROM checkpoint_metadata
            WHERE checkpoint_ns LIKE ?
        """,
            (f"%{self.run_id}%",),
        )
        if isinstance(ck_row, dict):
            checkpoint_count = list(ck_row.values())[0]
        else:
            checkpoint_count = ck_row[0]

        # Get API call stats
        api_row = self.db.fetchone(
            """
            SELECT COUNT(*), SUM(cost), SUM(duration_ms)
            FROM api_logs
            WHERE run_id = ?
        """,
            (self.run_id,),
        )
        if isinstance(api_row, dict):
            vals = list(api_row.values())
            api_calls, api_cost, api_duration = vals[0], vals[1], vals[2]
        else:
            api_calls, api_cost, api_duration = api_row

        # Get asset count
        rows = self.db.fetchall(
            """
            SELECT asset_type, COUNT(*)
            FROM generated_assets
            WHERE run_id = ?
            GROUP BY asset_type
        """,
            (self.run_id,),
        )
        if rows and isinstance(rows[0], dict):
            # COUNT(*) key name may vary; take second value
            assets_by_type = {list(r.values())[0]: list(r.values())[1] for r in rows}
        else:
            assets_by_type = dict(rows)

        return {
            "run_id": self.run_id,
            "workflow_name": workflow_name,
            "status": status,
            "start_time": start_time,
            "end_time": end_time,
            "total_cost": total_cost or 0.0,
            "api_cost": api_cost or 0.0,
            "checkpoint_count": checkpoint_count,
            "api_call_count": api_calls or 0,
            "total_api_duration_ms": api_duration or 0,
            "assets_by_type": assets_by_type,
            "metadata": json.loads(metadata) if metadata else {},
        }

    def close(self) -> None:
        """Close database connection."""
        if self.db:
            self.db.close()


@contextmanager
def track_step(
    tracker: MetadataTracker,
    checkpoint_ns: str,
    checkpoint_id: str,
    step_name: str,
    step_index: int,
):
    """Context manager for tracking step execution.

    Usage:
        with track_step(tracker, ns, id, "generate_screenplay", 0) as step:
            # Do work
            step.add_api_call(...)
            step.add_cost(10.0)

    Args:
        tracker: MetadataTracker instance
        checkpoint_ns: Checkpoint namespace
        checkpoint_id: Checkpoint ID
        step_name: Step name
        step_index: Step index

    Yields:
        StepTracker instance
    """

    class StepTracker:
        """Track individual step execution."""

        def __init__(self):
            self.start_time = time.time()
            self.api_calls = 0
            self.total_cost = 0.0
            self.error: str | None = None
            self.metadata: dict[str, Any] = {}

        def add_api_call(self, cost: float = 0.0) -> None:
            """Record an API call."""
            self.api_calls += 1
            self.total_cost += cost

        def add_cost(self, cost: float) -> None:
            """Add to total cost."""
            self.total_cost += cost

        def set_error(self, error: str) -> None:
            """Set error message."""
            self.error = error

        def set_metadata(self, key: str, value: Any) -> None:
            """Set metadata value."""
            self.metadata[key] = value

    step_tracker = StepTracker()

    try:
        yield step_tracker
    finally:
        execution_time_ms = int((time.time() - step_tracker.start_time) * 1000)

        tracker.record_checkpoint(
            checkpoint_ns=checkpoint_ns,
            checkpoint_id=checkpoint_id,
            step_name=step_name,
            step_index=step_index,
            execution_time_ms=execution_time_ms,
            api_calls=step_tracker.api_calls,
            total_cost=step_tracker.total_cost,
            error_message=step_tracker.error,
            metadata=step_tracker.metadata,
        )
