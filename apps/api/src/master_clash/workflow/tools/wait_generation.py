"""
Wait Generation Tool

Provides the wait_for_generation tool for waiting on async generation tasks.
"""

import asyncio
import logging

from langchain.tools import BaseTool, ToolRuntime
from pydantic import BaseModel, Field

from master_clash.workflow.backends import CanvasBackendProtocol

logger = logging.getLogger(__name__)


def create_wait_generation_tool(backend: CanvasBackendProtocol) -> BaseTool:
    """Create wait_for_generation tool."""
    from langchain_core.tools import tool

    class WaitForGenerationInput(BaseModel):
        node_id: str = Field(description="id of generated asset node or assetId")
        timeout_seconds: float = Field(description="Max wait time in seconds")

    @tool(args_schema=WaitForGenerationInput)
    async def wait_for_generation(
        node_id: str,
        timeout_seconds: float,
        runtime: ToolRuntime,
    ) -> str:
        """Wait for a generated asset node to be ready"""
        project_id = runtime.state.get("project_id", "")

        # Try to get node status from Loro first (real-time state)
        loro_client = runtime.config.get("configurable", {}).get("loro_client")

        if loro_client and loro_client.connected:
            try:
                start_time = asyncio.get_event_loop().time()
                while asyncio.get_event_loop().time() - start_time < timeout_seconds:
                    node_data = loro_client.get_node(node_id)
                    if node_data:
                        data = node_data.get("data", {})
                        status = data.get("status", "")

                        # Check if node has src/url (generation complete)
                        if data.get("src") or data.get("url") or data.get("base64"):
                            logger.info(f"[LoroSync] Node {node_id} generation completed (has media)")
                            return "Task completed."

                        if status == "completed":
                            logger.info(f"[LoroSync] Node {node_id} status: completed")
                            return "Task completed."
                        elif status == "failed":
                            error = data.get("error", "Unknown error")
                            return f"Task failed: {error}"
                        elif status in ("pending", "generating", ""):
                            await asyncio.sleep(1.0)
                            continue
                    else:
                        await asyncio.sleep(1.0)
                        continue

                return "Task still generating. Please retry wait_for_generation after a moment."

            except Exception as e:
                logger.error(f"[LoroSync] Error reading node {node_id} status: {e}")

        # Fall back to backend if Loro not available
        resolved_backend = backend(runtime) if callable(backend) else backend
        try:
            result = await resolved_backend.wait_for_task(
                project_id=project_id,
                node_id=node_id,
                timeout_seconds=timeout_seconds,
            )

            if result.error:
                return f"Error: {result.error}"

            if result.status == "completed":
                return "Task completed."
            elif result.status in ("pending", "generating"):
                return "Task still generating. Please retry wait_for_generation after a moment."
            elif result.status == "failed":
                return f"Task failed: {result.error}"
            else:
                return f"Node not found: {node_id}"

        except Exception as e:
            return f"Error waiting for task: {e}"

    return wait_for_generation
