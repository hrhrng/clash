"""
Kling AI Video Generation Tool with LangChain Integration
Provides video registry and tool wrappers similar to nano_banana pattern.
"""

from pathlib import Path

from langchain_core.tools import tool

from master_clash.config import get_settings
from master_clash.tools.kling import KlingVideoGenerator
from master_clash.utils import download_video, image_to_base64, text_message_part_template

# Get settings instance
settings = get_settings()

# Global video registry: maps video names to URLs
_VIDEO_REGISTRY: dict[str, str] = {}

# Counter for auto-generated video names
_GENERATED_VIDEO_COUNTER: dict[str, int] = {}


def register_video(name: str, url: str) -> None:
    """
    Register a video with a name for later reference.

    Args:
        name: Unique identifier for the video (e.g., "cat_animation", "scene_1")
        url: URL of the generated video
    """
    _VIDEO_REGISTRY[name] = url


def get_video(name: str) -> str:
    """
    Retrieve URL for a registered video.

    Args:
        name: Video identifier

    Returns:
        Video URL

    Raises:
        KeyError: If video name not found in registry
    """
    if name not in _VIDEO_REGISTRY:
        raise KeyError(
            f"Video '{name}' not found in registry. Available videos: {list(_VIDEO_REGISTRY.keys())}"
        )
    return _VIDEO_REGISTRY[name]


def clear_video_registry() -> None:
    """Clear all registered videos and counters."""
    _VIDEO_REGISTRY.clear()
    _GENERATED_VIDEO_COUNTER.clear()


def list_registered_videos() -> list[str]:
    """Get list of all registered video names."""
    return list(_VIDEO_REGISTRY.keys())


def get_video_registry_prompt() -> str:
    """
    Generate a prompt snippet describing available videos.

    Returns:
        Formatted string listing available videos for inclusion in system prompts
    """
    if not _VIDEO_REGISTRY:
        return "No videos are currently registered."

    video_list = ", ".join(f"'{name}'" for name in _VIDEO_REGISTRY)
    return f"Available generated videos: {video_list}. Use these names when referencing videos."


def _generate_video_name(base_name: str) -> str:
    """
    Generate a unique video name based on the base name.

    Args:
        base_name: Base name for the generated video (e.g., "cat_animation")

    Returns:
        Unique name like "cat_animation_1", "cat_animation_2", etc.
    """
    if base_name not in _GENERATED_VIDEO_COUNTER:
        _GENERATED_VIDEO_COUNTER[base_name] = 0

    _GENERATED_VIDEO_COUNTER[base_name] += 1
    return f"{base_name}_{_GENERATED_VIDEO_COUNTER[base_name]}"


def _save_video_to_file(
    video_url: str, filename: str, output_dir: str | None = None
) -> Path:
    """
    Download and save video to file.

    Args:
        video_url: URL of the video to download
        filename: Name of the file (without extension)
        output_dir: Directory to save the video (uses settings.output_dir if not provided)

    Returns:
        Full path to saved file
    """
    # Use configured output directory if not provided
    if output_dir is None:
        output_dir = settings.output_dir
    else:
        output_dir = Path(output_dir)

    # Create output directory if it doesn't exist
    output_dir.mkdir(parents=True, exist_ok=True)

    # Save as MP4
    filepath = output_dir / f"{filename}.mp4"

    # Download video
    download_video(video_url, str(filepath))

    return filepath


def kling_video_gen(
    image_path: str | None = None,
    base64_images: list[str] | None = None,
    prompt: str = "",
    duration: int = 5,
    cfg_scale: float = 0.5,
    negative_prompt: str | None = None,
    mode: str = "std",
    model: str = "kling-v1",
) -> str:
    """
    Generate video from image using Kling AI.

    Args:
        image_path: Path to input image file (deprecated)
        base64_images: List of base64 images. First is start frame, second is end frame.
        prompt: Text description for video generation
        duration: Video length in seconds (5 or 10)
        cfg_scale: Classifier Free Guidance scale (0-1, default 0.5)
        negative_prompt: Elements to avoid in generation
        mode: Generation mode ("std" or "pro")
        model: Model version ("kling-v1", "kling-v1-5", "kling-v1-6", etc.)

    Returns:
        URL of generated video
    """
    # Determine start and end images
    start_image = None
    tail_image = None

    if base64_images and len(base64_images) > 0:
        start_image = base64_images[0]
        if len(base64_images) > 1:
            tail_image = base64_images[1]
    elif image_path:
        # Fallback to image_path if no base64_images provided
        start_image = image_to_base64(image_path)
    
    if not start_image:
        raise ValueError("No input image provided (base64_images or image_path required)")

    # Initialize generator
    generator = KlingVideoGenerator()

    # Generate video
    result = generator.generate_video(
        image_url=start_image,
        tail_image_url=tail_image,
        prompt=prompt,
        duration=duration,
        cfg_scale=cfg_scale,
        negative_prompt=negative_prompt,
        is_base64=True,
        model=model,
        max_wait_time=600,  # Increase timeout to 10 minutes
    )

    # Extract video URL from result
    return result["data"]["task_result"]["videos"][0]["url"]


@tool
def kling_video_tool(
    image_path: str,
    prompt: str,
    base_name: str = "video",
    duration: int = 5,
    cfg_scale: float = 0.5,
    negative_prompt: str | None = None,
    mode: str = "std",
    model: str = "kling-v1",
) -> list[dict]:
    """
    Tool wrapper for Kling video generation from image.

    Args:
        image_path: Path to input image file (e.g., "./assets/cat.png")
        prompt: Text description for video generation (e.g., "猫咪轻轻摇头,背景虚化")
        base_name: Base name for generated video (default: "video")
        duration: Video length in seconds - 5 or 10 (default: 5)
        cfg_scale: Guidance scale 0-1, higher = more faithful to prompt (default: 0.5)
        negative_prompt: What to avoid in the video (optional)
        mode: Generation mode - "std" (standard, fast) or "pro" (high quality) (default: "std")
        model: Model version - "kling-v1", "kling-v1-5", "kling-v1-6", "kling-v2-master" (default: "kling-v1")

    Returns:
        List with text message containing registered video name and file path

    Example:
        >>> kling_video_tool(
        ...     image_path="./assets/cat.png",
        ...     prompt="一只可爱的猫咪在镜头前轻轻摇头",
        ...     base_name="cat_animation",
        ...     duration=5,
        ...     mode="pro"
        ... )
    """
    # Generate video
    video_url = kling_video_gen(
        image_path=image_path,
        prompt=prompt,
        duration=duration,
        cfg_scale=cfg_scale,
        negative_prompt=negative_prompt,
        mode=mode,
        model=model,
    )

    # Generate unique name
    video_name = _generate_video_name(base_name)

    # Register video
    register_video(video_name, video_url)

    # Save to file
    filepath = _save_video_to_file(video_url, video_name)

    return [
        text_message_part_template(
            f"✅ Video generated successfully!\n"
            f"Registered name: {video_name}\n"
            f"Saved to: {filepath}\n"
            f"URL: {video_url}\n"
            f"Duration: {duration}s | Mode: {mode} | Model: {model}"
        )
    ]


@tool
def get_video_url(video_name: str) -> list[dict]:
    """
    Retrieve URL for a registered video.

    Args:
        video_name: Name of the registered video

    Returns:
        List with text message containing video URL
    """
    try:
        url = get_video(video_name)
        return [text_message_part_template(f"Video URL for '{video_name}': {url}")]
    except KeyError as e:
        return [text_message_part_template(f"Error: {e}")]


@tool
def list_videos() -> list[dict]:
    """
    List all registered videos.

    Returns:
        List with text message containing all registered video names
    """
    videos = list_registered_videos()
    if not videos:
        return [text_message_part_template("No videos registered yet.")]

    video_list = "\n".join(f"- {name}" for name in videos)
    return [text_message_part_template(f"Registered videos:\n{video_list}")]


def test_kling_video_tool():
    """
    Example usage of kling_video_tool.
    Demonstrates the proper workflow:
    1. Generate video from image
    2. Video is automatically registered and saved
    3. Can retrieve video URL by name
    """
    print("=== Testing Kling Video Tool ===\n")

    # Test 1: Generate video
    print("1. Generating video from image...")
    result = kling_video_tool(
        image_path="./assets/cat_original_1.png",
        prompt="一只可爱的猫咪在镜头前轻轻摇头,背景虚化",
        base_name="cat_animation",
        duration=5,
        mode="std",
        model="kling-v1",
    )
    print(result[0]["text"])

    # Test 2: List videos
    print("\n2. Listing all videos...")
    videos = list_videos()
    print(videos[0]["text"])

    # Test 3: Get video URL
    print("\n3. Getting video URL...")
    url_result = get_video_url("cat_animation_1")
    print(url_result[0]["text"])

    # Clean up
    print("\n4. Cleaning up...")
    clear_video_registry()
    print("✅ Video registry cleared")


if __name__ == "__main__":
    test_kling_video_tool()
