# Kling AI Video Generation Guide

Complete guide for using Kling AI to generate videos from images.

## Table of Contents

- [Setup](#setup)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Setup

### 1. Environment Configuration

Add your Kling AI credentials to `.env`:

```bash
# Kling AI Video Generation (requires AK/SK for JWT authentication)
KLING_ACCESS_KEY=your-kling-access-key-here
KLING_SECRET_KEY=your-kling-secret-key-here
```

### 2. Installation

The required dependencies are already included:
- `pyjwt` - For JWT token generation
- `requests` - For API calls

## Quick Start

### Simple Usage

```python
from master_clash.tools.kling_video import kling_video_gen

# Generate video from image
video_url = kling_video_gen(
    image_path="./assets/my_image.png",
    prompt="描述你想要的视频动作",
    duration=5
)

print(f"Video URL: {video_url}")
```

### With LangChain Tool

```python
from master_clash.tools.kling_video import kling_video_tool

# Generate and auto-save video
result = kling_video_tool(
    image_path="./assets/my_image.png",
    prompt="一只猫咪轻轻摇头",
    base_name="cat_video",
    duration=5,
    mode="std"
)

print(result[0]["text"])
```

## API Reference

### Core Functions

#### `kling_video_gen()`

Generate video from image using Kling AI.

**Parameters:**
- `image_path` (str): Path to input image file
- `prompt` (str): Text description for video generation
- `duration` (int, default=5): Video length in seconds (5 or 10)
- `cfg_scale` (float, default=0.5): Guidance scale (0-1)
- `negative_prompt` (str, optional): Elements to avoid
- `mode` (str, default="std"): "std" (standard) or "pro" (high quality)
- `model` (str, default="kling-v1"): Model version

**Returns:**
- `str`: URL of generated video

#### `kling_video_tool()`

LangChain tool wrapper with auto-registration and saving.

**Parameters:**
- All parameters from `kling_video_gen()`
- `base_name` (str, default="video"): Base name for generated video

**Returns:**
- `list[dict]`: Message with video info and file path

### Registry Functions

#### `register_video(name, url)`
Register a video with a name for later reference.

#### `get_video(name)`
Retrieve URL for a registered video.

#### `list_registered_videos()`
Get list of all registered video names.

#### `clear_video_registry()`
Clear all registered videos.

## Examples

### Example 1: Basic Video Generation

```python
from master_clash.tools.kling_video import kling_video_gen

video_url = kling_video_gen(
    image_path="./assets/portrait.png",
    prompt="人物微笑并轻轻点头",
    duration=5
)
```

### Example 2: High Quality with Negative Prompts

```python
from master_clash.tools.kling_video import kling_video_tool

result = kling_video_tool(
    image_path="./assets/landscape.png",
    prompt="云朵缓缓飘动,树叶随风轻摆",
    base_name="landscape_animation",
    duration=10,
    cfg_scale=0.7,
    negative_prompt="模糊,失真,低质量,抖动",
    mode="pro",
    model="kling-v1"
)
```

### Example 3: Batch Processing

```python
from master_clash.tools.kling_video import kling_video_tool

prompts = [
    "人物向左看",
    "人物向右看",
    "人物微笑",
]

for i, prompt in enumerate(prompts, 1):
    result = kling_video_tool(
        image_path="./assets/portrait.png",
        prompt=prompt,
        base_name=f"action_{i}",
        duration=5
    )
    print(f"Generated: action_{i}")
```

### Example 4: Using Video Registry

```python
from master_clash.tools.kling_video import (
    kling_video_tool,
    list_registered_videos,
    get_video
)

# Generate multiple videos
for i in range(3):
    kling_video_tool(
        image_path="./assets/scene.png",
        prompt=f"场景 {i+1}",
        base_name="scene"
    )

# List all videos
videos = list_registered_videos()
print(f"Generated videos: {videos}")
# Output: ['scene_1', 'scene_2', 'scene_3']

# Get specific video URL
url = get_video("scene_1")
print(f"Video URL: {url}")
```

## Best Practices

### 1. Image Requirements

- **Format**: JPG, JPEG, or PNG
- **Size**: < 10MB
- **Resolution**: Minimum 300px width/height
- **Aspect Ratio**: Between 1:2.5 and 2.5:1

### 2. Prompt Writing

**Good prompts:**
- ✅ "一只猫咪慢慢转头看向镜头,背景虚化"
- ✅ "人物微笑并轻轻点头,自然光照"
- ✅ "云朵缓缓飘动,树叶随风轻摆"

**Avoid:**
- ❌ Too vague: "猫咪动"
- ❌ Too complex: "猫咪先跳起来再转圈然后趴下..."

### 3. Duration Selection

- **5 seconds**: Faster generation, lower cost, good for simple motions
- **10 seconds**: More complex animations, higher quality

### 4. Mode Selection

- **std (标准模式)**: Fast, cost-effective, good for testing
- **pro (专家模式)**: High quality, slower, better details

### 5. CFG Scale

- **0.3-0.5**: More creative freedom, AI adds details
- **0.6-0.8**: Balanced, follows prompt closely
- **0.9-1.0**: Very faithful to prompt, less creativity

### 6. Model Versions

- **kling-v1**: Base model, fast and stable
- **kling-v1-5**: Improved quality
- **kling-v1-6**: Latest improvements
- **kling-v2-master**: Next generation (if available)

## Troubleshooting

### Authentication Errors

If you get `401 Auth failed`:
1. Check your `KLING_ACCESS_KEY` and `KLING_SECRET_KEY` in `.env`
2. Ensure keys are valid and not expired
3. Verify you're using the Beijing endpoint (`api-beijing.klingai.com`)

### Base64 Format Errors

If you get `File is not in a valid base64 format`:
- The tool handles this automatically
- Ensure you're using `kling_video_gen()` or `kling_video_tool()`
- Don't manually add `data:image/...` prefix

### Timeout Errors

Video generation takes 3-5 minutes:
- Default timeout is 5 minutes (300s)
- For complex videos, increase timeout in `KlingVideoGenerator`

### Rate Limits

- Kling AI has rate limits per account
- Space out batch generations
- Use `time.sleep()` between requests if needed

## Advanced Usage

### Custom Timeout

```python
from master_clash.tools.kling import KlingVideoGenerator

generator = KlingVideoGenerator()

result = generator.generate_video(
    image_url=base64_image,
    prompt="复杂动画",
    duration=10,
    is_base64=True,
    poll_interval=10,      # Check every 10 seconds
    max_wait_time=600      # Wait up to 10 minutes
)
```

### Direct API Access

```python
from master_clash.tools.kling import KlingVideoGenerator
from master_clash.utils import image_to_base64

# Initialize generator
generator = KlingVideoGenerator()

# Convert image
base64_image = image_to_base64("./assets/image.png")

# Generate video
result = generator.generate_video(
    image_url=base64_image,
    prompt="Your prompt here",
    duration=5,
    cfg_scale=0.5,
    is_base64=True,
    model="kling-v1"
)

# Extract URL
video_url = result["data"]["task_result"]["videos"][0]["url"]
```

## See Also

- [Kling AI Official Documentation](https://app.klingai.com/cn/dev/document-api)
- [Example Code](../examples/kling_video_example.py)
- [API Reference](./api_reference.md)
