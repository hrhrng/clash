"""
Example: Image-to-Video Generation with Kling KIE API

This script demonstrates how to use the Kling KIE image-to-video API.
Make sure to set KIE_API_KEY in your .env file before running.
"""

import json
from src.master_clash.tools.kling_kie import (
    KlingKIEVideoGenerator,
    image_to_video,
    text_to_video
)


def example_1_simple_image_to_video():
    """Simple image-to-video generation."""
    print("=" * 60)
    print("Example 1: Simple Image-to-Video")
    print("=" * 60)

    video_url = image_to_video(
        image_url="https://file.aiquickdraw.com/custom-page/akr/section-images/1759211376283gfcw5zcy.png",
        prompt="Camera slowly zooming in, smooth natural movement",
        duration="5"
    )

    print(f"✅ Video generated!")
    print(f"   URL: {video_url}")
    print()


def example_2_advanced_image_to_video():
    """Advanced image-to-video with custom parameters."""
    print("=" * 60)
    print("Example 2: Advanced Image-to-Video")
    print("=" * 60)

    generator = KlingKIEVideoGenerator()

    result = generator.generate_video_from_image(
        image_url="https://file.aiquickdraw.com/custom-page/akr/section-images/1759211376283gfcw5zcy.png",
        prompt="Person smiling and waving, natural facial expressions",
        duration="5",
        negative_prompt="blur, distortion, unnatural movement, low quality",
        cfg_scale=0.6
    )

    # Parse results
    result_json = json.loads(result["resultJson"])
    video_url = result_json["resultUrls"][0]

    print(f"✅ Video generated!")
    print(f"   URL: {video_url}")
    print(f"   Task ID: {result['taskId']}")
    print(f"   Cost Time: {result.get('costTime', 0) / 1000:.1f}s")
    print(f"   Model: {result['model']}")
    print()


def example_3_text_to_video():
    """Text-to-video for comparison."""
    print("=" * 60)
    print("Example 3: Text-to-Video (for comparison)")
    print("=" * 60)

    video_url = text_to_video(
        prompt="A beautiful mountain landscape at sunset with clouds moving",
        duration="5",
        aspect_ratio="16:9"
    )

    print(f"✅ Video generated!")
    print(f"   URL: {video_url}")
    print()


def example_4_async_workflow():
    """Async workflow - create task and check later."""
    print("=" * 60)
    print("Example 4: Async Workflow")
    print("=" * 60)

    generator = KlingKIEVideoGenerator()

    # Create task
    task_id = generator.create_image_to_video_task(
        image_url="https://file.aiquickdraw.com/custom-page/akr/section-images/1759211376283gfcw5zcy.png",
        prompt="Camera panning left to right slowly",
        duration="5"
    )

    print(f"✅ Task created: {task_id}")
    print("   You can check status later with query_task()")

    # Query status
    import time
    print("   Waiting 10 seconds before checking status...")
    time.sleep(10)

    status = generator.query_task(task_id)
    print(f"   Current status: {status.get('state')}")

    if status.get('state') == 'success':
        result_json = json.loads(status["resultJson"])
        print(f"   Video URL: {result_json['resultUrls'][0]}")
    print()


if __name__ == "__main__":
    print("\n" + "🎬" * 30)
    print("Kling KIE Image-to-Video Examples")
    print("🎬" * 30 + "\n")

    try:
        # Run examples
        example_1_simple_image_to_video()
        example_2_advanced_image_to_video()
        example_3_text_to_video()
        example_4_async_workflow()

        print("=" * 60)
        print("✅ All examples completed successfully!")
        print("=" * 60)

    except ValueError as e:
        print(f"❌ Configuration error: {e}")
        print("   Make sure KIE_API_KEY is set in your .env file")

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
