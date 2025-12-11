"""
Kling AI Image-to-Video API Wrapper
Provides interface for generating videos from images using Kling AI's v1.6 Pro model.
Supports both URL and base64-encoded image inputs.
Uses JWT authentication with Access Key and Secret Key.
"""

import os
import time
from typing import Any, Optional

import jwt
import requests
from dotenv import load_dotenv
from master_clash.database.metadata import MetadataTracker

load_dotenv()


class KlingVideoGenerator:
    """Wrapper for Kling AI Image-to-Video API with JWT authentication."""

    # Official Kling API endpoints (using Beijing region)
    BASE_URL = "https://api-beijing.klingai.com/v1/videos/image2video"
    QUERY_URL = "https://api-beijing.klingai.com/v1/videos/image2video"
    DEFAULT_MODEL = "kling-v1"  # or "kling-v1-5", "kling-v1-6", "kling-v2-master" etc.

    def __init__(
        self,
        access_key: str | None = None,
        secret_key: str | None = None
    ):
        """
        Initialize Kling Video Generator.

        Args:
            access_key: Kling Access Key. If not provided, reads from KLING_ACCESS_KEY env variable.
            secret_key: Kling Secret Key. If not provided, reads from KLING_SECRET_KEY env variable.
        """
        self.access_key = access_key or os.getenv("KLING_ACCESS_KEY")
        self.secret_key = secret_key or os.getenv("KLING_SECRET_KEY")

        if not self.access_key or not self.secret_key:
            raise ValueError(
                "KLING_ACCESS_KEY and KLING_SECRET_KEY not found. "
                "Set them in environment or pass to constructor."
            )

        self.headers = {
            "Authorization": f"Bearer {self._generate_jwt_token()}",
            "Content-Type": "application/json"
        }

    def _generate_jwt_token(self) -> str:
        """
        Generate JWT token using Access Key and Secret Key.

        Returns:
            JWT token string valid for 30 minutes
        """
        headers = {
            "alg": "HS256",
            "typ": "JWT"
        }
        payload = {
            "iss": self.access_key,
            "exp": int(time.time()) + 1800,  # Valid for 30 minutes
            "nbf": int(time.time()) - 5  # Start valid 5 seconds ago
        }
        token = jwt.encode(payload, self.secret_key, headers=headers)
        return token

    @staticmethod
    def _format_image_data(image_data: str, is_base64: bool = False) -> str:
        """
        Format image data - Kling API requires raw base64 without data URI prefix.

        Args:
            image_data: Base64 string or URL
            is_base64: If True, treats input as base64

        Returns:
            Formatted image data (raw base64 or URL)
        """
        if is_base64:
            # Kling API requires raw base64 WITHOUT data URI prefix
            # Remove data URI prefix if present
            if image_data.startswith("data:"):
                # Extract base64 part after the comma
                return image_data.split(",", 1)[1] if "," in image_data else image_data
            return image_data
        return image_data

    def generate_video(
        self,
        image_url: str,
        prompt: str | None = None,
        duration: int = 5,
        tail_image_url: str | None = None,
        negative_prompt: str | None = None,
        cfg_scale: float = 0.5,
        static_mask_url: str | None = None,
        dynamic_masks: list[dict[str, Any]] | None = None,
        camera_control: dict[str, Any] | None = None,
        external_task_id: str | None = None,
        poll_interval: int = 5,
        max_wait_time: int = 300,
        is_base64: bool = False,
        model: str | None = None,
        tracker: Optional[MetadataTracker] = None,
        checkpoint_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Generate video from image using Kling AI.

        Args:
            image_url: Direct URL or base64-encoded image
            prompt: Text description for video generation
            duration: Video length in seconds (5 or 10)
            tail_image_url: URL or base64 for ending frame
            negative_prompt: Elements to avoid
            cfg_scale: Classifier Free Guidance scale (0-1, default 0.5)
            static_mask_url: URL or base64 for static brush area
            dynamic_masks: List of dynamic mask configurations
            camera_control: Advanced camera movement parameters
            external_task_id: Custom task identifier
            poll_interval: Seconds between status checks
            max_wait_time: Maximum wait time in seconds
            is_base64: Set to True if image_url is base64-encoded
            model: Model version (kling-v1 or kling-v1-5)

        Returns:
            Dict containing video URL and metadata

        Example:
            >>> generator = KlingVideoGenerator()
            >>> # With URL
            >>> result = generator.generate_video(
            ...     image_url="https://example.com/image.jpg",
            ...     prompt="A cat walking in a garden",
            ...     duration=5
            ... )
            >>> # With base64
            >>> result = generator.generate_video(
            ...     image_url=base64_image_data,
            ...     prompt="Camera slowly panning",
            ...     duration=5,
            ...     is_base64=True
            ... )
            >>> print(result['data']['task_result']['videos'][0]['url'])
        """
        if duration not in [5, 10]:
            raise ValueError("Duration must be 5 or 10 seconds")

        if cfg_scale < 0 or cfg_scale > 1:
            raise ValueError("cfg_scale must be between 0 and 1")

        # Format image data - for Kling API, keep as base64 or URL
        formatted_image = self._format_image_data(image_url, is_base64)

        # Build request payload for Kling official API
        payload = {
            "model_name": model or self.DEFAULT_MODEL,
            "image": formatted_image,
            "duration": str(duration)  # Kling API expects string
        }

        # Add optional parameters
        if tail_image_url:
            payload["image_tail"] = self._format_image_data(tail_image_url, is_base64)
        if prompt:
            payload["prompt"] = prompt
        if negative_prompt:
            payload["negative_prompt"] = negative_prompt
        if cfg_scale != 0.5:  # Only add if non-default
            payload["cfg_scale"] = cfg_scale

        # Create generation task
        t0 = time.time()
        response = requests.post(
            self.BASE_URL,
            json=payload,
            headers=self.headers
        )
        duration_ms = int((time.time() - t0) * 1000)
        if tracker:
            try:
                tracker.record_api_call(
                    service="kling",
                    endpoint="POST /v1/videos/image2video",
                    checkpoint_id=checkpoint_id,
                    request_params={
                        "model_name": payload.get("model_name"),
                        "duration": payload.get("duration"),
                        "has_prompt": bool(prompt),
                        "is_base64": is_base64,
                    },
                    response_data={"ok": response.ok},
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                )
            except Exception:
                pass
        if not response.ok:
            print(f"Kling API Error: {response.status_code} - {response.text}")
        response.raise_for_status()

        result = response.json()

        # Kling API returns task_id in data field
        if result.get("code") != 0:
            raise RuntimeError(f"API returned error: {result}")

        task_id = result.get("data", {}).get("task_id")

        if not task_id:
            raise RuntimeError(f"No task_id returned: {result}")

        # Poll for completion
        return self._poll_generation(
            task_id, poll_interval, max_wait_time, tracker=tracker, checkpoint_id=checkpoint_id
        )

    def _poll_generation(
        self,
        task_id: str,
        poll_interval: int,
        max_wait_time: int,
        tracker: Optional[MetadataTracker] = None,
        checkpoint_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """
        Poll generation status until completion.

        Args:
            task_id: The generation task ID
            poll_interval: Seconds between checks
            max_wait_time: Maximum wait time

        Returns:
            Completed generation result
        """
        start_time = time.time()
        query_url = f"{self.QUERY_URL}/{task_id}"

        while time.time() - start_time < max_wait_time:
            t0 = time.time()
            response = requests.get(
                query_url,
                headers=self.headers
            )
            duration_ms = int((time.time() - t0) * 1000)
            if tracker:
                try:
                    tracker.record_api_call(
                        service="kling",
                        endpoint="GET /v1/videos/image2video/{task_id}",
                        checkpoint_id=checkpoint_id,
                        request_params={"task_id": task_id},
                        response_data={"ok": response.ok},
                        status_code=response.status_code,
                        duration_ms=duration_ms,
                    )
                except Exception:
                    pass
            response.raise_for_status()

            result = response.json()

            # Kling API returns code=0 for success
            if result.get("code") != 0:
                raise RuntimeError(f"Query failed: {result}")

            data = result.get("data", {})
            task_status = data.get("task_status")

            # Status: submitted, processing, succeed, failed
            if task_status == "succeed":
                # Record asset if available
                if tracker:
                    try:
                        videos = (
                            result.get("data", {})
                            .get("task_result", {})
                            .get("videos", [])
                        )
                        if videos:
                            url = videos[0].get("url")
                            if url:
                                tracker.record_asset(
                                    asset_type="video",
                                    asset_path=url,
                                    checkpoint_id=checkpoint_id,
                                    asset_url=url,
                                    generation_params={"task_id": task_id},
                                    cost=0.0,
                                )
                    except Exception:
                        pass
                return result
            elif task_status == "failed":
                error_msg = data.get("task_status_msg", "Unknown error")
                raise RuntimeError(f"Video generation failed: {error_msg}")

            print(f"Status: {task_status}, waiting {poll_interval}s...")
            time.sleep(poll_interval)

        raise TimeoutError(
            f"Video generation timed out after {max_wait_time}s. "
            f"Task ID: {task_id}"
        )

    def get_generation_status(self, task_id: str) -> dict[str, Any]:
        """
        Check status of a generation task.

        Args:
            task_id: The generation task ID

        Returns:
            Current status and results (if completed)
        """
        response = requests.get(
            f"{self.QUERY_URL}/{task_id}",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()


# Convenience functions for simple usage
def image_to_video(
    image_url: str,
    prompt: str | None = None,
    duration: int = 5,
    access_key: str | None = None,
    secret_key: str | None = None
) -> str:
    """
    Simple wrapper to generate video from image URL.

    Args:
        image_url: URL to image
        prompt: Optional text description
        duration: Video duration (5 or 10 seconds)
        access_key: Kling Access Key (optional)
        secret_key: Kling Secret Key (optional)

    Returns:
        URL of generated video

    Example:
        >>> video_url = image_to_video(
        ...     "https://example.com/sunset.jpg",
        ...     "Camera slowly panning across the sunset"
        ... )
    """
    generator = KlingVideoGenerator(
        access_key=access_key,
        secret_key=secret_key
    )
    result = generator.generate_video(
        image_url=image_url,
        prompt=prompt,
        duration=duration,
        is_base64=False
    )
    # Kling API returns: result["data"]["task_result"]["videos"][0]["url"]
    return result["data"]["task_result"]["videos"][0]["url"]


def base64_to_video(
    base64_image: str,
    prompt: str | None = None,
    duration: int = 5,
    cfg_scale: float = 0.5,
    negative_prompt: str | None = None,
    access_key: str | None = None,
    secret_key: str | None = None
) -> str:
    """
    Generate video from base64-encoded image.
    Similar interface to nano_banana_gen for consistency.

    Args:
        base64_image: Base64-encoded image data (with or without data URI prefix)
        prompt: Text description for video generation
        duration: Video duration (5 or 10 seconds)
        cfg_scale: Guidance scale (0-1, default 0.5)
        negative_prompt: Elements to avoid in generation
        access_key: Kling Access Key (optional)
        secret_key: Kling Secret Key (optional)

    Returns:
        URL of generated video

    Example:
        >>> from utils import image_to_base64
        >>> base64_img = image_to_base64("./output/sunset_mountains.png")
        >>> video_url = base64_to_video(
        ...     base64_img,
        ...     "日落时分,云朵缓缓飘动",
        ...     duration=5
        ... )
        >>> print(f"Video ready: {video_url}")
    """
    generator = KlingVideoGenerator(
        access_key=access_key,
        secret_key=secret_key
    )
    result = generator.generate_video(
        image_url=base64_image,
        prompt=prompt,
        duration=duration,
        cfg_scale=cfg_scale,
        negative_prompt=negative_prompt,
        is_base64=True
    )
    # Kling API returns: result["data"]["task_result"]["videos"][0]["url"]
    return result["data"]["task_result"]["videos"][0]["url"]


if __name__ == "__main__":
    # Example 1: Simple base64 workflow (recommended)
    from master_clash.utils import download_video, image_to_base64

    print("=== Example 1: Base64 Image to Video (Simple) ===")
    base64_img = image_to_base64("./assets/cat_original_1.png")
    video_url = base64_to_video(
        base64_img,
        prompt="一只可爱的猫咪在镜头前轻轻摇头,背景虚化",
        duration=5,
        cfg_scale=0.5
    )
    print(f"✅ Video URL: {video_url}")

    # Download the video
    download_video(video_url, "./output/kling_video_1.mp4")
    print("✅ Video saved to ./output/kling_video_1.mp4")
    print()

    # Example 2: Advanced usage with full control
    print("=== Example 2: Advanced Usage with KlingVideoGenerator ===")
    generator = KlingVideoGenerator()

    result = generator.generate_video(
        image_url=base64_img,
        prompt="A cute cat gently shaking its head, background blurred",
        duration=5,
        cfg_scale=0.5,
        negative_prompt="blurry, distorted, low quality",
        is_base64=True,
        model="kling-v1"
    )

    print("✅ Video generated successfully!")
    print(f"   URL: {result['data']['task_result']['videos'][0]['url']}")
    print(f"   Duration: {result['data']['task_result']['videos'][0]['duration']}s")
    print(f"   Task ID: {result['data']['task_id']}")

    # Download the video
    download_video(result['data']['task_result']['videos'][0]['url'], "./output/kling_video_2.mp4")
    print("✅ Video saved to ./output/kling_video_2.mp4")

    # Example 3: Using URL (if you have hosted images)
    # print("\n=== Example 3: URL-based Generation ===")
    # video_url = image_to_video(
    #     "https://example.com/test-image.jpg",
    #     "Camera slowly panning across the sunset"
    # )
    # download_video(video_url, "./output/kling_video_3.mp4")
