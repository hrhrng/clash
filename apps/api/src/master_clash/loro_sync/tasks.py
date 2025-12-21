"""
Task Operations for Loro Sync Client

Provides methods for reading task status from the tasks map.
"""

import logging
from typing import Any

from loro import LoroDoc

logger = logging.getLogger(__name__)


class LoroTasksMixin:
    """Mixin providing task read operations."""

    doc: LoroDoc

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        """Get a task by ID."""
        tasks_map = self.doc.get_map("tasks")
        all_tasks = tasks_map.get_deep_value() or {}
        task = all_tasks.get(task_id)
        logger.debug(f"[LoroSyncClient] Get task: {task_id} -> {'found' if task else 'not found'}")
        return task

    def get_all_tasks(self) -> dict[str, Any]:
        """Get all tasks."""
        tasks_map = self.doc.get_map("tasks")
        tasks = {k: v for k, v in tasks_map.items()}
        logger.debug(f"[LoroSyncClient] Get all tasks: {len(tasks)} tasks")
        return tasks
