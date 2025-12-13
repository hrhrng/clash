# Kling KIE Video Generation API Usage Guide

This document explains how to use the Kling KIE video generation tools in the master-clash project.

## Overview

The `kling_kie.py` module provides a Python wrapper for the Kling AI v2.5 Turbo Pro models via the KIE.ai API. It supports two modes:

1. **Text-to-Video**: Generate videos from text descriptions
2. **Image-to-Video**: Animate static images with motion and camera movements

## Setup

### 1. Get API Key

1. Visit [KIE.ai API Key Management](https://kie.ai/api-key)
2. Sign up and get your API key

### 2. Configure Environment

Add your API key to the `.env` file:

```bash
KIE_API_KEY=your-kie-api-key-here
```

## Basic Usage

### 1. Text-to-Video Generation

#### Simple Usage

```python
from master_clash.tools.kling_kie import text_to_video

# Generate a 5-second video from text
video_url = text_to_video(
    prompt="A beautiful sunset over mountains with clouds moving slowly",
    duration="5",
    aspect_ratio="16:9"
)

print(f"Video URL: {video_url}")
```

### 2. Image-to-Video Generation

#### Simple Usage

```python
from master_clash.tools.kling_kie import image_to_video

# Animate an image
video_url = image_to_video(
    image_url="https://example.com/my-image.jpg",
    prompt="Camera slowly zooming in, person smiling",
    duration="5"
)

print(f"Video URL: {video_url}")
```

### Advanced Usage with Full Control

```python
from master_clash.tools.kling_kie import KlingKIEVideoGenerator

# Initialize the generator
generator = KlingKIEVideoGenerator()

# Generate video with custom parameters
result = generator.generate_video(
    prompt="Real-time playback. Wide shot of a ruined city: collapsed towers, fires blazing",
    duration="10",
    aspect_ratio="16:9",
    negative_prompt="blur, distort, low quality, bad lighting",
    cfg_scale=0.6,
    poll_interval=5,
    max_wait_time=300
)

# Parse the result
import json
result_json = json.loads(result["resultJson"])
video_url = result_json["resultUrls"][0]

print(f"Video URL: {video_url}")
print(f"Cost Time: {result.get('costTime', 0) / 1000:.1f}s")
```

### Async Workflow (Create Task and Check Later)

```python
from master_clash.tools.kling_kie import KlingKIEVideoGenerator

generator = KlingKIEVideoGenerator()

# Create task
task_id = generator.create_task(
    prompt="A cat walking gracefully in a Japanese garden",
    duration="5"
)
print(f"Task created: {task_id}")

# Later, check status
status = generator.query_task(task_id)
print(f"Status: {status.get('state')}")

# When ready, get results
if status.get('state') == 'success':
    import json
    result_json = json.loads(status["resultJson"])
    video_url = result_json["resultUrls"][0]
    print(f"Video ready: {video_url}")
```

## API Reference

### `KlingKIEVideoGenerator`

Main class for interacting with the Kling KIE API.

#### Constructor

```python
generator = KlingKIEVideoGenerator(api_key=None)
```

**Parameters:**
- `api_key` (str, optional): KIE.ai API key. If not provided, reads from `KIE_API_KEY` environment variable.

#### Methods

##### `create_task()`

Creates a video generation task.

```python
task_id = generator.create_task(
    prompt="Your video description",
    duration="5",
    aspect_ratio="16:9",
    negative_prompt="blur, distort, and low quality",
    cfg_scale=0.5,
    callback_url=None
)
```

**Parameters:**
- `prompt` (str, required): Text description of the video (max 2500 characters)
- `duration` (str, optional): Video duration - `"5"` or `"10"` seconds (default: `"5"`)
- `aspect_ratio` (str, optional): Video aspect ratio - `"16:9"`, `"9:16"`, or `"1:1"` (default: `"16:9"`)
- `negative_prompt` (str, optional): Things to avoid (max 2500 characters, default: `"blur, distort, and low quality"`)
- `cfg_scale` (float, optional): Classifier Free Guidance scale, 0-1 (default: 0.5)
- `callback_url` (str, optional): URL for task completion callbacks

**Returns:** Task ID (str)

##### `query_task()`

Queries the status of a generation task.

```python
status = generator.query_task(task_id)
```

**Parameters:**
- `task_id` (str): The task ID from `create_task()`

**Returns:** Dict with task status and results

**Response fields:**
- `taskId`: Task ID
- `state`: Task status (`"waiting"`, `"success"`, or `"fail"`)
- `resultJson`: JSON string with video URLs (when `state="success"`)
- `failCode`, `failMsg`: Error details (when `state="fail"`)
- `costTime`: Processing time in milliseconds
- `createTime`, `completeTime`: Timestamps

##### `wait_for_completion()`

Waits for a task to complete by polling.

```python
result = generator.wait_for_completion(
    task_id,
    poll_interval=5,
    max_wait_time=300
)
```

**Parameters:**
- `task_id` (str): The task ID
- `poll_interval` (int, optional): Seconds between status checks (default: 5)
- `max_wait_time` (int, optional): Maximum wait time in seconds (default: 300)

**Returns:** Completed task data with results

##### `generate_video()`

Convenience method that combines `create_task()` and `wait_for_completion()`.

```python
result = generator.generate_video(
    prompt="Your video description",
    duration="5",
    aspect_ratio="16:9",
    negative_prompt="blur, distort, and low quality",
    cfg_scale=0.5,
    poll_interval=5,
    max_wait_time=300
)
```

**Parameters:** Same as `create_task()` plus polling parameters

**Returns:** Completed task data with results

##### `create_image_to_video_task()`

Creates an image-to-video generation task.

```python
task_id = generator.create_image_to_video_task(
    image_url="https://example.com/image.jpg",
    prompt="Camera zooming in slowly",
    duration="5",
    tail_image_url=None,
    negative_prompt="blur, distort, and low quality",
    cfg_scale=0.5,
    callback_url=None
)
```

**Parameters:**
- `image_url` (str, required): URL of image to animate (max 10MB, jpeg/png/webp)
- `prompt` (str, required): Text description for animation (max 2500 characters)
- `duration` (str, optional): Video duration - `"5"` or `"10"` seconds (default: `"5"`)
- `tail_image_url` (str, optional): URL for ending frame (max 10MB, jpeg/png/webp)
- `negative_prompt` (str, optional): Things to avoid (max 2500 characters, default: `"blur, distort, and low quality"`)
- `cfg_scale` (float, optional): Classifier Free Guidance scale, 0-1 (default: 0.5)
- `callback_url` (str, optional): URL for task completion callbacks

**Returns:** Task ID (str)

##### `generate_video_from_image()`

Convenience method that combines `create_image_to_video_task()` and `wait_for_completion()`.

```python
result = generator.generate_video_from_image(
    image_url="https://example.com/portrait.jpg",
    prompt="Person smiling and waving",
    duration="5",
    tail_image_url=None,
    negative_prompt="blur, distort, and low quality",
    cfg_scale=0.5,
    poll_interval=5,
    max_wait_time=300
)
```

**Parameters:** Same as `create_image_to_video_task()` plus polling parameters

**Returns:** Completed task data with results

### Convenience Functions

#### `text_to_video()`

Simple function for basic video generation.

```python
from master_clash.tools.kling_kie import text_to_video

video_url = text_to_video(
    prompt="Your video description",
    duration="5",
    aspect_ratio="16:9",
    api_key=None
)
```

**Parameters:**
- `prompt` (str): Video description
- `duration` (str, optional): `"5"` or `"10"` (default: `"5"`)
- `aspect_ratio` (str, optional): `"16:9"`, `"9:16"`, or `"1:1"` (default: `"16:9"`)
- `api_key` (str, optional): API key override

**Returns:** Video URL (str)

#### `image_to_video()`

Simple function for image-to-video generation.

```python
from master_clash.tools.kling_kie import image_to_video

video_url = image_to_video(
    image_url="https://example.com/portrait.jpg",
    prompt="Person smiling and waving",
    duration="5",
    tail_image_url=None,
    api_key=None
)
```

**Parameters:**
- `image_url` (str): URL of image to animate
- `prompt` (str): Text description for animation
- `duration` (str, optional): `"5"` or `"10"` (default: `"5"`)
- `tail_image_url` (str, optional): URL for ending frame
- `api_key` (str, optional): API key override

**Returns:** Video URL (str)

## Parameter Details

### Duration
- `"5"`: 5-second video
- `"10"`: 10-second video

### Aspect Ratio
- `"16:9"`: Widescreen (landscape)
- `"9:16"`: Vertical (portrait)
- `"1:1"`: Square

### CFG Scale
- Range: 0.0 to 1.0
- Lower values (0.3-0.5): More creative/varied results
- Higher values (0.6-0.8): Closer adherence to prompt
- Default: 0.5

### Negative Prompt
Things to avoid in the generated video. Common examples:
- `"blur, distort, and low quality"`
- `"bad lighting, watermark, text"`
- `"shaky camera, compression artifacts"`

## Error Handling

```python
from master_clash.tools.kling_kie import KlingKIEVideoGenerator

generator = KlingKIEVideoGenerator()

try:
    result = generator.generate_video(
        prompt="A beautiful landscape",
        duration="5"
    )
    import json
    video_url = json.loads(result["resultJson"])["resultUrls"][0]
    print(f"Success: {video_url}")

except ValueError as e:
    print(f"Invalid parameters: {e}")

except RuntimeError as e:
    print(f"Generation failed: {e}")

except TimeoutError as e:
    print(f"Timed out: {e}")

except Exception as e:
    print(f"Unexpected error: {e}")
```

## Callback URL (Optional)

If you provide a `callback_url` when creating a task, the KIE.ai API will send a POST request to that URL when the task completes:

```python
task_id = generator.create_task(
    prompt="A beautiful sunset",
    duration="5",
    callback_url="https://your-domain.com/api/callback"
)
```

The callback will receive the same data structure as the `query_task()` response.

## Best Practices

1. **Prompt Quality**: Write clear, detailed descriptions
   - Good: "Wide shot of a sunset over mountains, clouds moving slowly, warm golden lighting"
   - Poor: "sunset"

2. **Error Handling**: Always wrap API calls in try-except blocks

3. **Timeouts**: Adjust `max_wait_time` based on video duration
   - 5-second videos: typically 60-120 seconds
   - 10-second videos: typically 120-300 seconds

4. **Rate Limiting**: Be mindful of API rate limits and costs

5. **Testing**: Start with 5-second videos to test prompts

## Examples

### Example 1: Cinematic Scene

```python
from master_clash.tools.kling_kie import text_to_video

video_url = text_to_video(
    prompt="Real-time playback. Wide shot of a ruined city: collapsed towers, "
           "fires blazing, storm clouds with lightning. Camera drops fast from "
           "the sky over burning streets and tilted buildings.",
    duration="10",
    aspect_ratio="16:9"
)
```

### Example 2: Nature Scene

```python
from master_clash.tools.kling_kie import KlingKIEVideoGenerator

generator = KlingKIEVideoGenerator()

result = generator.generate_video(
    prompt="A serene forest scene with sunlight filtering through trees, "
           "gentle wind causing leaves to sway, birds flying in the distance",
    duration="5",
    aspect_ratio="16:9",
    negative_prompt="blur, distortion, low quality, artificial lighting",
    cfg_scale=0.5
)
```

### Example 3: Social Media Content (Vertical)

```python
from master_clash.tools.kling_kie import text_to_video

video_url = text_to_video(
    prompt="Close-up of a barista pouring latte art, steam rising, "
           "smooth camera movement, warm cafe lighting",
    duration="5",
    aspect_ratio="9:16"  # Vertical for social media
)
```

### Example 4: Image-to-Video (Portrait Animation)

```python
from master_clash.tools.kling_kie import image_to_video

video_url = image_to_video(
    image_url="https://example.com/portrait.jpg",
    prompt="Person smiling naturally, slight head movement, warm lighting",
    duration="5"
)
```

### Example 5: Image-to-Video with Ending Frame

```python
from master_clash.tools.kling_kie import KlingKIEVideoGenerator

generator = KlingKIEVideoGenerator()

result = generator.generate_video_from_image(
    image_url="https://example.com/start-frame.jpg",
    prompt="Smooth transition with camera pan",
    duration="10",
    tail_image_url="https://example.com/end-frame.jpg",  # Optional ending frame
    cfg_scale=0.6
)

import json
result_json = json.loads(result["resultJson"])
video_url = result_json["resultUrls"][0]
print(f"Video URL: {video_url}")
```

### Example 6: Batch Image-to-Video Processing

```python
from master_clash.tools.kling_kie import KlingKIEVideoGenerator

generator = KlingKIEVideoGenerator()

images = [
    {"url": "https://example.com/image1.jpg", "prompt": "Camera zoom in"},
    {"url": "https://example.com/image2.jpg", "prompt": "Person waving"},
    {"url": "https://example.com/image3.jpg", "prompt": "Smooth pan left"},
]

# Create tasks
task_ids = []
for img in images:
    task_id = generator.create_image_to_video_task(
        image_url=img["url"],
        prompt=img["prompt"],
        duration="5"
    )
    task_ids.append(task_id)
    print(f"Created task: {task_id}")

# Check status later
import time
time.sleep(60)

for task_id in task_ids:
    status = generator.query_task(task_id)
    if status.get("state") == "success":
        import json
        result_json = json.loads(status["resultJson"])
        print(f"Video ready: {result_json['resultUrls'][0]}")
```

## Integration with Master Clash

You can use this tool in your master-clash workflows:

```python
from master_clash.tools.kling_kie import text_to_video
from master_clash.utils import download_video  # If you have this utility

# Generate video
video_url = text_to_video(
    prompt="Your scene description",
    duration="5"
)

# Download to output directory
output_path = "./output/my_video.mp4"
download_video(video_url, output_path)
print(f"Video saved to: {output_path}")
```

## Troubleshooting

### "KIE_API_KEY not found"
- Make sure you've set `KIE_API_KEY` in your `.env` file
- Or pass `api_key` parameter directly to the constructor

### "Task creation failed: 401"
- Check that your API key is valid
- Visit https://kie.ai/api-key to verify

### "Task creation failed: 402"
- Insufficient account balance
- Add credits to your KIE.ai account

### Timeouts
- Increase `max_wait_time` parameter
- Check task status manually with `query_task()`
- Some complex videos may take longer to generate

## API Rate Limits

Check the [KIE.ai documentation](https://kie.ai) for current rate limits and pricing.

## Related Documentation

- [Kling Image-to-Video Tool](./kling_usage.md) (if exists)
- [Master Clash Configuration](../src/master_clash/config.py)
- [KIE.ai API Documentation](https://kie.ai/docs)
