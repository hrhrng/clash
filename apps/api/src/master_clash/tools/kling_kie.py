"""
Kling KIE Text-to-Video and Image-to-Video API Wrapper
Provides interface for generating videos from text or images using Kling AI's v2.5 Turbo Pro model via KIE.ai API.
"""

import json
import os
import time
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv()


class KlingKIEVideoGenerator:
    """Wrapper for Kling AI Text-to-Video and Image-to-Video API via KIE.ai."""

    BASE_URL = "https://api.kie.ai/api/v1/jobs"
    CREATE_TASK_URL = f"{BASE_URL}/createTask"
    QUERY_TASK_URL = f"{BASE_URL}/recordInfo"
    TEXT_TO_VIDEO_MODEL = "kling/v2-5-turbo-text-to-video-pro"
    IMAGE_TO_VIDEO_MODEL = "kling/v2-5-turbo-image-to-video-pro"

    def __init__(self, api_key: str | None = None):
        """
        Initialize Kling KIE Video Generator.

        Args:
            api_key: KIE.ai API key. If not provided, reads from KIE_API_KEY env variable.
        """
        self.api_key = api_key or os.getenv("KIE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "KIE_API_KEY not found. Set it in environment or pass to constructor."
            )

        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }

    def create_task(
        self,
        prompt: str,
        duration: str = "5",
        aspect_ratio: str = "16:9",
        negative_prompt: str = "blur, distort, and low quality",
        cfg_scale: float = 0.5,
        callback_url: str | None = None
    ) -> str:
        """
        Create a video generation task.

        Args:
            prompt: Text description of the video (max 2500 chars)
            duration: Video duration ("5" or "10" seconds)
            aspect_ratio: Video aspect ratio ("16:9", "9:16", or "1:1")
            negative_prompt: Things to avoid (max 2500 chars)
            cfg_scale: Classifier Free Guidance scale (0-1, default 0.5)
            callback_url: Optional callback URL for completion notifications

        Returns:
            Task ID for status queries

        Raises:
            ValueError: If parameters are invalid
            requests.HTTPError: If API request fails
        """
        # Validation
        if not prompt or len(prompt) > 2500:
            raise ValueError("Prompt must be 1-2500 characters")

        if duration not in ["5", "10"]:
            raise ValueError("Duration must be '5' or '10' seconds")

        if aspect_ratio not in ["16:9", "9:16", "1:1"]:
            raise ValueError("Aspect ratio must be '16:9', '9:16', or '1:1'")

        if negative_prompt and len(negative_prompt) > 2500:
            raise ValueError("Negative prompt must not exceed 2500 characters")

        if not (0 <= cfg_scale <= 1):
            raise ValueError("cfg_scale must be between 0 and 1")

        # Build request payload
        payload = {
            "model": self.TEXT_TO_VIDEO_MODEL,
            "input": {
                "prompt": prompt,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "negative_prompt": negative_prompt,
                "cfg_scale": cfg_scale
            }
        }

        # Add optional callback URL
        if callback_url:
            payload["callBackUrl"] = callback_url

        # Create task
        response = requests.post(
            self.CREATE_TASK_URL,
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 200:
            raise RuntimeError(f"Task creation failed: {result.get('msg', 'Unknown error')}")

        task_id = result.get("data", {}).get("taskId")
        if not task_id:
            raise RuntimeError(f"No task ID returned: {result}")

        return task_id

    def create_image_to_video_task(
        self,
        image_url: str,
        prompt: str,
        duration: str = "5",
        tail_image_url: str | None = None,
        negative_prompt: str = "blur, distort, and low quality",
        cfg_scale: float = 0.5,
        callback_url: str | None = None
    ) -> str:
        """
        Create an image-to-video generation task.

        Args:
            image_url: URL of the image to animate (max 10MB, jpeg/png/webp)
            prompt: Text description for video generation (max 2500 chars)
            duration: Video duration ("5" or "10" seconds)
            tail_image_url: Optional URL for ending frame (max 10MB, jpeg/png/webp)
            negative_prompt: Things to avoid (max 2500 chars)
            cfg_scale: Classifier Free Guidance scale (0-1, default 0.5)
            callback_url: Optional callback URL for completion notifications

        Returns:
            Task ID for status queries

        Raises:
            ValueError: If parameters are invalid
            requests.HTTPError: If API request fails

        Example:
            >>> generator = KlingKIEVideoGenerator()
            >>> task_id = generator.create_image_to_video_task(
            ...     image_url="https://example.com/image.jpg",
            ...     prompt="Camera slowly zooming in on the subject",
            ...     duration="5"
            ... )
        """
        # Validation
        if not image_url:
            raise ValueError("image_url is required")

        if not prompt or len(prompt) > 2500:
            raise ValueError("Prompt must be 1-2500 characters")

        if duration not in ["5", "10"]:
            raise ValueError("Duration must be '5' or '10' seconds")

        if negative_prompt and len(negative_prompt) > 2500:
            raise ValueError("Negative prompt must not exceed 2500 characters")

        if not (0 <= cfg_scale <= 1):
            raise ValueError("cfg_scale must be between 0 and 1")

        # Build request payload
        payload = {
            "model": self.IMAGE_TO_VIDEO_MODEL,
            "input": {
                "image_url": image_url,
                "prompt": prompt,
                "duration": duration,
                "negative_prompt": negative_prompt,
                "cfg_scale": cfg_scale
            }
        }

        # Add optional parameters
        if tail_image_url:
            payload["input"]["tail_image_url"] = tail_image_url

        if callback_url:
            payload["callBackUrl"] = callback_url

        # Create task
        response = requests.post(
            self.CREATE_TASK_URL,
            json=payload,
            headers=self.headers
        )
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 200:
            raise RuntimeError(f"Task creation failed: {result.get('msg', 'Unknown error')}")

        task_id = result.get("data", {}).get("taskId")
        if not task_id:
            raise RuntimeError(f"No task ID returned: {result}")

        return task_id

    def query_task(self, task_id: str) -> dict[str, Any]:
        """
        Query the status of a generation task.

        Args:
            task_id: The task ID returned from create_task

        Returns:
            Dict containing task status and results

        Example response:
            {
                "taskId": "...",
                "model": "kling/v2-5-turbo-text-to-video-pro",
                "state": "success",  # "waiting", "success", or "fail"
                "param": "{...}",  # Original request params as JSON string
                "resultJson": "{\"resultUrls\":[\"https://...\"]}", # Results as JSON string
                "failCode": null,
                "failMsg": null,
                "costTime": 45000,  # milliseconds
                "completeTime": 1757584209490,
                "createTime": 1757584164490
            }
        """
        response = requests.get(
            self.QUERY_TASK_URL,
            params={"taskId": task_id},
            headers=self.headers
        )
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 200:
            raise RuntimeError(f"Query failed: {result.get('msg', 'Unknown error')}")

        return result.get("data", {})

    def wait_for_completion(
        self,
        task_id: str,
        poll_interval: int = 5,
        max_wait_time: int = 300
    ) -> dict[str, Any]:
        """
        Wait for task completion by polling status.

        Args:
            task_id: The task ID
            poll_interval: Seconds between status checks
            max_wait_time: Maximum wait time in seconds

        Returns:
            Completed task data with results

        Raises:
            TimeoutError: If max_wait_time is exceeded
            RuntimeError: If task fails
        """
        start_time = time.time()

        while time.time() - start_time < max_wait_time:
            task_data = self.query_task(task_id)
            state = task_data.get("state")

            if state == "success":
                return task_data
            elif state == "fail":
                fail_msg = task_data.get("failMsg", "Unknown error")
                fail_code = task_data.get("failCode", "N/A")
                raise RuntimeError(
                    f"Video generation failed (code: {fail_code}): {fail_msg}"
                )

            print(f"Status: {state}, waiting {poll_interval}s...")
            time.sleep(poll_interval)

        raise TimeoutError(
            f"Video generation timed out after {max_wait_time}s. "
            f"Task ID: {task_id}"
        )

    def generate_video(
        self,
        prompt: str,
        duration: str = "5",
        aspect_ratio: str = "16:9",
        negative_prompt: str = "blur, distort, and low quality",
        cfg_scale: float = 0.5,
        poll_interval: int = 5,
        max_wait_time: int = 300
    ) -> dict[str, Any]:
        """
        Generate video from text prompt (convenience method).

        This method combines create_task and wait_for_completion.

        Args:
            prompt: Text description of the video
            duration: Video duration ("5" or "10" seconds)
            aspect_ratio: Video aspect ratio ("16:9", "9:16", or "1:1")
            negative_prompt: Things to avoid
            cfg_scale: Classifier Free Guidance scale (0-1)
            poll_interval: Seconds between status checks
            max_wait_time: Maximum wait time in seconds

        Returns:
            Dict containing video URLs and metadata

        Example:
            >>> generator = KlingKIEVideoGenerator()
            >>> result = generator.generate_video(
            ...     prompt="A cat walking in a garden",
            ...     duration="5",
            ...     aspect_ratio="16:9"
            ... )
            >>> # Parse result
            >>> result_json = json.loads(result['resultJson'])
            >>> video_url = result_json['resultUrls'][0]
            >>> print(f"Video URL: {video_url}")
        """
        # Create task
        task_id = self.create_task(
            prompt=prompt,
            duration=duration,
            aspect_ratio=aspect_ratio,
            negative_prompt=negative_prompt,
            cfg_scale=cfg_scale
        )

        print(f"Task created: {task_id}")

        # Wait for completion
        return self.wait_for_completion(task_id, poll_interval, max_wait_time)

    def generate_video_from_image(
        self,
        image_url: str,
        prompt: str,
        duration: str = "5",
        tail_image_url: str | None = None,
        negative_prompt: str = "blur, distort, and low quality",
        cfg_scale: float = 0.5,
        poll_interval: int = 5,
        max_wait_time: int = 300
    ) -> dict[str, Any]:
        """
        Generate video from image (convenience method).

        This method combines create_image_to_video_task and wait_for_completion.

        Args:
            image_url: URL of the image to animate
            prompt: Text description for video generation
            duration: Video duration ("5" or "10" seconds)
            tail_image_url: Optional URL for ending frame
            negative_prompt: Things to avoid
            cfg_scale: Classifier Free Guidance scale (0-1)
            poll_interval: Seconds between status checks
            max_wait_time: Maximum wait time in seconds

        Returns:
            Dict containing video URLs and metadata

        Example:
            >>> generator = KlingKIEVideoGenerator()
            >>> result = generator.generate_video_from_image(
            ...     image_url="https://example.com/portrait.jpg",
            ...     prompt="Person smiling and waving at camera",
            ...     duration="5"
            ... )
            >>> # Parse result
            >>> result_json = json.loads(result['resultJson'])
            >>> video_url = result_json['resultUrls'][0]
            >>> print(f"Video URL: {video_url}")
        """
        # Create task
        task_id = self.create_image_to_video_task(
            image_url=image_url,
            prompt=prompt,
            duration=duration,
            tail_image_url=tail_image_url,
            negative_prompt=negative_prompt,
            cfg_scale=cfg_scale
        )

        print(f"Image-to-video task created: {task_id}")

        # Wait for completion
        return self.wait_for_completion(task_id, poll_interval, max_wait_time)


# Convenience functions for simple usage
def text_to_video(
    prompt: str,
    duration: str = "5",
    aspect_ratio: str = "16:9",
    api_key: str | None = None
) -> str:
    """
    Simple wrapper to generate video from text prompt.

    Args:
        prompt: Text description of the video
        duration: Video duration ("5" or "10" seconds)
        aspect_ratio: Video aspect ratio ("16:9", "9:16", or "1:1")
        api_key: KIE.ai API key (optional)

    Returns:
        URL of generated video

    Example:
        >>> video_url = text_to_video(
        ...     "A beautiful sunset over mountains with clouds moving",
        ...     duration="5",
        ...     aspect_ratio="16:9"
        ... )
        >>> print(f"Video ready: {video_url}")
    """
    generator = KlingKIEVideoGenerator(api_key=api_key)
    result = generator.generate_video(
        prompt=prompt,
        duration=duration,
        aspect_ratio=aspect_ratio
    )

    # Parse resultJson to get video URL
    result_json = json.loads(result["resultJson"])
    return result_json["resultUrls"][0]


def image_to_video(
    image_url: str,
    prompt: str,
    duration: str = "5",
    tail_image_url: str | None = None,
    api_key: str | None = None
) -> str:
    """
    Simple wrapper to generate video from image URL.

    Args:
        image_url: URL of the image to animate
        prompt: Text description for video generation
        duration: Video duration ("5" or "10" seconds)
        tail_image_url: Optional URL for ending frame
        api_key: KIE.ai API key (optional)

    Returns:
        URL of generated video

    Example:
        >>> video_url = image_to_video(
        ...     image_url="https://example.com/portrait.jpg",
        ...     prompt="Person smiling and looking around",
        ...     duration="5"
        ... )
        >>> print(f"Video ready: {video_url}")
    """
    generator = KlingKIEVideoGenerator(api_key=api_key)
    result = generator.generate_video_from_image(
        image_url=image_url,
        prompt=prompt,
        duration=duration,
        tail_image_url=tail_image_url
    )

    # Parse resultJson to get video URL
    result_json = json.loads(result["resultJson"])
    return result_json["resultUrls"][0]


if __name__ == "__main__":
    # Example 1: Simple text-to-video
    print("=== Example 1: Text to Video (Simple) ===")

    video_url = text_to_video(
        prompt="Real-time playback. Wide shot of a ruined city: collapsed towers, fires blazing, storm clouds with lightning.",
        duration="5",
        aspect_ratio="16:9"
    )
    print(f"✅ Video URL: {video_url}")
    print()

    # Example 2: Advanced usage with full control
    print("=== Example 2: Advanced Usage with KlingKIEVideoGenerator ===")
    generator = KlingKIEVideoGenerator()

    result = generator.generate_video(
        prompt="A serene landscape with gentle wind blowing through trees, camera slowly panning",
        duration="10",
        aspect_ratio="16:9",
        negative_prompt="blur, distort, low quality, bad lighting",
        cfg_scale=0.6,
        poll_interval=5,
        max_wait_time=300
    )

    print("✅ Video generated successfully!")

    # Parse result
    result_json = json.loads(result["resultJson"])
    video_url = result_json["resultUrls"][0]

    print(f"   Video URL: {video_url}")
    print(f"   Task ID: {result['taskId']}")
    print(f"   Cost Time: {result.get('costTime', 0) / 1000:.1f}s")
    print(f"   Model: {result['model']}")

    # Optional: Download the video
    # from src.master_clash.utils import download_video
    # download_video(video_url, "./output/kling_kie_video.mp4")

    # Example 3: Image-to-Video (Simple)
    print("\n=== Example 3: Image to Video (Simple) ===")
    video_url = image_to_video(
        image_url="https://file.aiquickdraw.com/custom-page/akr/section-images/1759211376283gfcw5zcy.png",
        prompt="Camera slowly zooming in, smooth motion",
        duration="5"
    )
    print(f"✅ Video URL: {video_url}")
    print()

    # Example 4: Image-to-Video with Advanced Options
    print("=== Example 4: Image to Video (Advanced) ===")
    result = generator.generate_video_from_image(
        image_url="https://file.aiquickdraw.com/custom-page/akr/section-images/1759211376283gfcw5zcy.png",
        prompt="Person smiling and waving, natural movement",
        duration="5",
        negative_prompt="blur, distortion, unnatural movement",
        cfg_scale=0.6
    )

    result_json = json.loads(result["resultJson"])
    video_url = result_json["resultUrls"][0]

    print("✅ Image-to-video generated successfully!")
    print(f"   Video URL: {video_url}")
    print(f"   Task ID: {result['taskId']}")
    print(f"   Cost Time: {result.get('costTime', 0) / 1000:.1f}s")

    # Example 5: Async workflow (create task and check later)
    print("\n=== Example 5: Async Workflow ===")
    task_id = generator.create_task(
        prompt="A cat walking gracefully in a Japanese garden",
        duration="5"
    )
    print(f"Task created: {task_id}")
    print("You can check status later with query_task()")

    # Check immediately for demo
    import time
    time.sleep(5)
    status = generator.query_task(task_id)
    print(f"Current status: {status.get('state')}")
