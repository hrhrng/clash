"""
Sync Server Client for submitting AIGC tasks to loro-sync-server.

This module provides a client for submitting tasks to the Cloudflare-based
sync server, which handles task management, polling, and real-time updates
via Loro CRDT.
"""

import os
from typing import Any, Literal

import requests
from pydantic import BaseModel


class TaskSubmissionResponse(BaseModel):
    """Response from task submission"""

    task_id: str
    status: str
    created_at: int


class TaskStatusResponse(BaseModel):
    """Full task status from server"""

    task_id: str
    project_id: str
    task_type: str
    status: str
    external_task_id: str | None = None
    external_service: str | None = None
    params: str
    result_url: str | None = None
    result_data: str | None = None
    error_message: str | None = None
    created_at: int
    updated_at: int
    completed_at: int | None = None
    retry_count: int
    max_retries: int


class SyncServerClient:
    """Client for interacting with loro-sync-server"""

    def __init__(self, base_url: str | None = None):
        """
        Initialize sync server client.

        Args:
            base_url: Base URL of sync server. If not provided, reads from
                     SYNC_SERVER_URL env variable or defaults to localhost.
        """
        self.base_url = (
            base_url
            or os.getenv("SYNC_SERVER_URL")
            or "http://localhost:8787"
        )

    def submit_task(
        self,
        project_id: str,
        task_type: Literal["kling_video", "nano_banana", "nano_banana_pro"],
        params: dict[str, Any],
    ) -> TaskSubmissionResponse:
        """
        Submit a new AIGC task to the sync server.

        Args:
            project_id: Project identifier
            task_type: Type of task to submit
            params: Task parameters (task-specific)

        Returns:
            Task submission response with task_id

        Raises:
            requests.HTTPError: If submission fails

        Example:
            >>> client = SyncServerClient()
            >>> response = client.submit_task(
            ...     project_id="proj_123",
            ...     task_type="kling_video",
            ...     params={
            ...         "image_path": "path/to/image.png",
            ...         "prompt": "A cat walking",
            ...         "duration": 5
            ...     }
            ... )
            >>> print(response.task_id)
        """
        url = f"{self.base_url}/tasks"

        payload = {
            "project_id": project_id,
            "task_type": task_type,
            "params": params,
        }

        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()

        data = response.json()
        return TaskSubmissionResponse(**data)

    def get_task_status(self, task_id: str) -> TaskStatusResponse:
        """
        Get current status of a task.

        Args:
            task_id: Task identifier

        Returns:
            Full task status

        Raises:
            requests.HTTPError: If task not found or request fails
        """
        url = f"{self.base_url}/tasks/{task_id}"

        response = requests.get(url, timeout=10)
        response.raise_for_status()

        data = response.json()
        return TaskStatusResponse(**data)

    def wait_for_task(
        self,
        task_id: str,
        poll_interval: int = 5,
        max_wait_time: int = 300,
    ) -> TaskStatusResponse:
        """
        Wait for task to complete by polling.

        Note: This is a fallback for when WebSocket connection is not available.
        The preferred method is to listen to Loro updates in real-time.

        Args:
            task_id: Task identifier
            poll_interval: Seconds between status checks
            max_wait_time: Maximum wait time in seconds

        Returns:
            Completed task status

        Raises:
            TimeoutError: If task doesn't complete within max_wait_time
            RuntimeError: If task fails
        """
        import time

        start_time = time.time()

        while time.time() - start_time < max_wait_time:
            status = self.get_task_status(task_id)

            if status.status == "completed":
                return status
            elif status.status == "failed":
                raise RuntimeError(
                    f"Task {task_id} failed: {status.error_message}"
                )

            time.sleep(poll_interval)

        raise TimeoutError(
            f"Task {task_id} did not complete within {max_wait_time}s"
        )


# Global client instance
_client: SyncServerClient | None = None


def get_sync_client() -> SyncServerClient:
    """Get or create global sync server client"""
    global _client
    if _client is None:
        _client = SyncServerClient()
    return _client


def submit_kling_video_task(
    project_id: str,
    image_path: str,
    prompt: str,
    duration: int = 5,
    cfg_scale: float = 0.5,
    negative_prompt: str | None = None,
    mode: str = "std",
    model: str = "kling-v1",
) -> str:
    """
    Submit a Kling video generation task to sync server.

    This is a convenience wrapper that submits the task and returns the task_id.
    The actual video generation will be handled asynchronously by the sync server,
    and results will be broadcast via Loro CRDT to all connected clients.

    Args:
        project_id: Project identifier
        image_path: Path to input image
        prompt: Text description for video generation
        duration: Video length in seconds (5 or 10)
        cfg_scale: Guidance scale 0-1
        negative_prompt: Elements to avoid
        mode: Generation mode ("std" or "pro")
        model: Model version

    Returns:
        Task ID for tracking

    Example:
        >>> task_id = submit_kling_video_task(
        ...     project_id="proj_123",
        ...     image_path="./assets/cat.png",
        ...     prompt="A cat walking in a garden",
        ...     duration=5
        ... )
        >>> print(f"Task submitted: {task_id}")
        >>> # Task will complete asynchronously and update via Loro
    """
    client = get_sync_client()

    params = {
        "image_path": image_path,
        "prompt": prompt,
        "duration": duration,
        "cfg_scale": cfg_scale,
        "negative_prompt": negative_prompt,
        "mode": mode,
        "model": model,
    }

    response = client.submit_task(
        project_id=project_id,
        task_type="kling_video",
        params=params,
    )

    return response.task_id


def submit_nano_banana_task(
    project_id: str,
    text: str,
    system_prompt: str = "",
    image_names: list[str] | None = None,
    aspect_ratio: str = "4:3",
) -> str:
    """
    Submit a Nano Banana image generation task to sync server.

    Args:
        project_id: Project identifier
        text: Text prompt for image generation
        system_prompt: System-level instructions
        image_names: List of registered image names to use as anchors
        aspect_ratio: Desired aspect ratio

    Returns:
        Task ID for tracking
    """
    client = get_sync_client()

    params = {
        "text": text,
        "system_prompt": system_prompt,
        "image_names": image_names or [],
        "aspect_ratio": aspect_ratio,
    }

    response = client.submit_task(
        project_id=project_id,
        task_type="nano_banana",
        params=params,
    )

    return response.task_id
