"""Test script for Remotion render service."""
import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from master_clash.services.remotion_render import render_video_with_remotion


# Test timeline DSL with text
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
                    "text": "Hello Remotion!",
                    "color": "#ffffff",
                    "fontSize": 120,
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
    "compositionWidth": 1920,
    "compositionHeight": 1080,
    "fps": 30,
    "durationInFrames": 90,  # 3 seconds
}


async def main():
    print("Testing Remotion render service...")
    bundle_path = Path(__file__).parent.parent.parent / "packages" / "remotion-components" / "build" / "bundle.js"
    print(f"Bundle exists: {bundle_path.exists()}")

    result = await render_video_with_remotion(
        timeline_dsl=TEST_TIMELINE_DSL,
        project_id="test-project",
        task_id="test-task",
    )

    if result.success:
        print(f"✅ Render successful! R2 key: {result.r2_key}")
    else:
        print(f"❌ Render failed: {result.error}")


if __name__ == "__main__":
    asyncio.run(main())
