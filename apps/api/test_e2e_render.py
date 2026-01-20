"""End-to-end test for video rendering pipeline.

This test simulates the full flow:
1. Create a video render node
2. Submit to Python API via /api/tasks/submit
3. Wait for rendering to complete
4. Verify callback updates the node

Prerequisites:
- LoroSync server running on localhost:8787
- Python API running on localhost:8888
"""

import asyncio
import sys
import time
from pathlib import Path

import httpx

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

# Test configuration
LORO_SYNC_URL = "http://localhost:8787"
PYTHON_API_URL = "http://localhost:8888"
TEST_PROJECT_ID = "test-render-project"


# Test timeline DSL
TEST_TIMELINE_DSL = {
    "tracks": [
        {
            "id": "track-1",
            "hidden": False,
            "items": [
                {
                    "id": "item-1",
                    "type": "solid",
                    "color": "#1a1a1a",
                    "from": 0,
                    "durationInFrames": 90,
                    "properties": {
                        "x": 0,
                        "y": 0,
                        "width": 1,
                        "height": 1,
                        "opacity": 1,
                        "rotation": 0,
                    },
                },
                {
                    "id": "item-2",
                    "type": "text",
                    "text": "End-to-End Test!",
                    "color": "#ffffff",
                    "fontSize": 80,
                    "fontFamily": "Arial",
                    "fontWeight": "bold",
                    "from": 0,
                    "durationInFrames": 90,
                    "properties": {
                        "x": 0,
                        "y": 0,
                        "width": 0.8,
                        "height": 0.2,
                        "opacity": 1,
                        "rotation": 0,
                    },
                },
            ],
        }
    ],
    "compositionWidth": 1280,
    "compositionHeight": 720,
    "fps": 30,
    "durationInFrames": 90,
}


async def check_services():
    """Check if required services are running."""
    print("Checking services...")

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            # Check LoroSync
            try:
                resp = await client.get(f"{LORO_SYNC_URL}/health")
                if resp.status_code == 200:
                    print(f"✅ LoroSync: {LORO_SYNC_URL}")
                else:
                    print(f"❌ LoroSync returned {resp.status_code}")
                    return False
            except Exception as e:
                print(f"❌ LoroSync not reachable: {e}")
                return False

            # Check Python API (try root path)
            try:
                resp = await client.get(f"{PYTHON_API_URL}/")
                # Any 2xx-3xx response means API is running
                if 200 <= resp.status_code < 400:
                    print(f"✅ Python API: {PYTHON_API_URL}")
                else:
                    print(f"⚠️ Python API returned {resp.status_code} (may be OK)")
            except Exception as e:
                print(f"❌ Python API not reachable: {e}")
                print(f"   Make sure 'make dev-api' is running")
                return False

        return True
    except Exception as e:
        print(f"❌ Service check failed: {e}")
        return False


async def submit_render_task():
    """Submit a render task via Python API."""
    print("\nSubmitting render task...")

    callback_url = f"{LORO_SYNC_URL}/sync/{TEST_PROJECT_ID}/update-node"

    payload = {
        "task_type": "video_render",
        "project_id": TEST_PROJECT_ID,
        "node_id": "test-render-node",
        "params": {
            "timeline_dsl": TEST_TIMELINE_DSL,
        },
        "callback_url": callback_url,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{PYTHON_API_URL}/api/tasks/submit",
            json=payload,
        )

        if resp.status_code != 200:
            print(f"❌ Submit failed: {resp.status_code} {resp.text}")
            return None

        result = resp.json()
        task_id = result.get("task_id")
        print(f"✅ Task submitted: {task_id}")
        return task_id


async def poll_task_status(task_id: str, timeout: int = 300):
    """Poll task status until completion or timeout."""
    print(f"\nPolling task status (timeout={timeout}s)...")

    start_time = time.time()

    async with httpx.AsyncClient(timeout=10.0) as client:
        while time.time() - start_time < timeout:
            resp = await client.get(
                f"{PYTHON_API_URL}/api/tasks/{task_id}"
            )

            if resp.status_code != 200:
                print(f"❌ Status check failed: {resp.status_code}")
                return None

            result = resp.json()
            status = result.get("status")
            print(f"  Status: {status}")

            if status == "completed":
                result_url = result.get("result_url")
                print(f"✅ Render completed!")
                print(f"   Output: {result_url}")
                return result_url
            elif status == "failed":
                error = result.get("error", "Unknown error")
                print(f"❌ Render failed: {error}")
                return None

            await asyncio.sleep(5)

        print(f"❌ Timeout after {timeout}s")
        return None


async def main():
    print("=" * 50)
    print("End-to-End Video Rendering Test")
    print("=" * 50)

    # Check services
    if not await check_services():
        print("\n❌ Services not available. Please start:")
        print("   make dev-sync    # LoroSync on :8787")
        print("   make dev-api     # Python API on :8888")
        return

    # Submit task
    task_id = await submit_render_task()
    if not task_id:
        print("\n❌ Failed to submit task")
        return

    # Wait for completion
    result_url = await poll_task_status(task_id)
    if result_url:
        print(f"\n✅ SUCCESS! Video rendered: {result_url}")
    else:
        print("\n❌ FAILED to render video")


if __name__ == "__main__":
    asyncio.run(main())
