"""
Kling Video Generation Examples
Demonstrates various ways to use the Kling video generation tools.
"""

from pathlib import Path

from master_clash.tools.kling_video import (
    clear_video_registry,
    get_video,
    kling_video_gen,
    kling_video_tool,
    list_registered_videos,
    list_videos,
    register_video,
)


def example_1_simple_generation():
    """Example 1: Simple video generation from image."""
    print("=" * 60)
    print("Example 1: Simple Video Generation")
    print("=" * 60)

    # Generate video using the simple function
    video_url = kling_video_gen(
        image_path="./assets/cat_original_1.png",
        prompt="一只可爱的猫咪在镜头前轻轻摇头,背景虚化",
        duration=5,
        mode="std",
    )

    print(f"✅ Video generated!")
    print(f"   URL: {video_url}")
    print()


def example_2_tool_usage():
    """Example 2: Using the LangChain tool wrapper."""
    print("=" * 60)
    print("Example 2: LangChain Tool Usage")
    print("=" * 60)

    # Use the tool wrapper (automatically registers and saves video)
    result = kling_video_tool(
        image_path="./assets/cat_original_1.png",
        prompt="一只可爱的猫咪在镜头前轻轻摇头,背景虚化",
        base_name="cat_animation",
        duration=5,
        cfg_scale=0.5,
        mode="std",
        model="kling-v1",
    )

    # Tool returns a formatted message
    print(result[0]["text"])
    print()


def example_3_registry_management():
    """Example 3: Managing video registry."""
    print("=" * 60)
    print("Example 3: Video Registry Management")
    print("=" * 60)

    # Generate and register multiple videos
    for i in range(2):
        result = kling_video_tool(
            image_path="./assets/cat_original_1.png",
            prompt=f"猫咪动画 - 版本 {i + 1}",
            base_name="cat_test",
            duration=5,
        )
        print(f"Generated video {i + 1}")

    # List all registered videos
    print("\nRegistered videos:")
    videos = list_registered_videos()
    for video in videos:
        print(f"  - {video}")

    # Get specific video URL
    if videos:
        first_video = videos[0]
        url = get_video(first_video)
        print(f"\nURL of '{first_video}': {url}")

    # Use the list_videos tool
    print("\nUsing list_videos tool:")
    result = list_videos()
    print(result[0]["text"])

    print()


def example_4_advanced_options():
    """Example 4: Advanced generation options."""
    print("=" * 60)
    print("Example 4: Advanced Options")
    print("=" * 60)

    # High quality generation with negative prompts
    result = kling_video_tool(
        image_path="./assets/cat_original_1.png",
        prompt="一只优雅的猫咪慢慢转头看向镜头,眼神温柔,毛发清晰可见",
        base_name="cat_hq",
        duration=5,
        cfg_scale=0.7,  # Higher guidance for more faithful generation
        negative_prompt="模糊,失真,低质量,噪点,抖动",
        mode="pro",  # High quality mode
        model="kling-v1",
    )

    print(result[0]["text"])
    print()


def example_5_batch_generation():
    """Example 5: Batch video generation."""
    print("=" * 60)
    print("Example 5: Batch Generation")
    print("=" * 60)

    # Different prompts for the same image
    prompts = [
        "猫咪向左看",
        "猫咪向右看",
        "猫咪眨眼睛",
    ]

    for i, prompt in enumerate(prompts, 1):
        print(f"\nGenerating video {i}/{len(prompts)}: {prompt}")
        result = kling_video_tool(
            image_path="./assets/cat_original_1.png",
            prompt=prompt,
            base_name=f"cat_action_{i}",
            duration=5,
            mode="std",
        )
        print(f"  ✅ Done: {result[0]['text'].split('Registered name:')[1].split()[0]}")

    print("\n✅ All videos generated!")
    print()


def cleanup():
    """Clean up the video registry."""
    print("=" * 60)
    print("Cleanup")
    print("=" * 60)

    clear_video_registry()
    print("✅ Video registry cleared")
    print()


def main():
    """Run all examples."""
    print("\n🎬 Kling Video Generation Examples\n")

    # Create output directory if it doesn't exist
    Path("./output").mkdir(exist_ok=True)

    try:
        # Run examples
        example_1_simple_generation()
        example_2_tool_usage()
        example_3_registry_management()
        example_4_advanced_options()
        example_5_batch_generation()

    finally:
        # Always cleanup
        cleanup()

    print("🎉 All examples completed!\n")


if __name__ == "__main__":
    main()
