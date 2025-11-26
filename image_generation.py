"""
Image generation module for video production system.
Contains functions for generating images using Gemini and Nano Banana Pro.
"""

import base64
import json
import mimetypes
import os
import time
from typing import List, Dict, Optional

import requests
from google import genai
from google.genai import types
from langchain_core.tools import tool

from config import (
    GEMINI_API_KEY,
    IMAGE_MODEL_NAME,
    NANO_BANANA_API_KEY,
    NANO_BANANA_BASE_URL,
    PRODUCTION_ASSETS_DIR
)
from utils import save_binary_file, image_to_base64, ensure_directory


# ============================================================================
# Gemini Image Generation
# ============================================================================

@tool
def generate_image(
    prompt: str,
    filename: str,
    reference_images_base64: Optional[List[Dict[str, str]]] = None,
    system_instruction: str = ""
) -> str:
    """
    Generates an image using the Gemini image model based on the prompt.
    Supports multiple reference images for consistency.

    Args:
        prompt: The detailed image generation prompt.
        filename: The filename to save the image as (e.g., 'char_noah.png').
        reference_images_base64: Optional list of dicts with 'data' (base64 string) and 'mime_type'.
        system_instruction: Optional system instruction for consistent style.

    Returns:
        Success message with file paths
    """
    print(f"\n🎨 [Generating Image] '{filename}'")
    print(f"   Prompt: {prompt[:100]}...")
    if reference_images_base64:
        print(f"   Reference Images: {len(reference_images_base64)} image(s)")

    client = genai.Client(api_key=GEMINI_API_KEY)
    model = IMAGE_MODEL_NAME

    # Build parts list with text prompt and optional reference images
    parts = []

    # Add reference images first if provided
    if reference_images_base64:
        for ref_img in reference_images_base64:
            image_data = base64.b64decode(ref_img['data'])
            mime_type = ref_img.get('mime_type', 'image/png')
            parts.append(types.Part.from_bytes(data=image_data, mime_type=mime_type))

    # Add text prompt
    parts.append(types.Part.from_text(text=prompt))

    contents = [
        types.Content(
            role="user",
            parts=parts,
        ),
    ]

    generate_content_config = types.GenerateContentConfig(
        response_modalities=[
            "IMAGE",
            "TEXT",
        ],
        image_config=types.ImageConfig(
            image_size="1K",
        ),
        tools=[types.Tool(googleSearch=types.GoogleSearch())],
        system_instruction=[
            types.Part.from_text(text=system_instruction),
        ] if system_instruction else None,
    )

    ensure_directory(PRODUCTION_ASSETS_DIR)

    file_index = 0
    saved_files = []

    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        if (
            chunk.candidates is None
            or chunk.candidates[0].content is None
            or chunk.candidates[0].content.parts is None
        ):
            continue

        if chunk.candidates[0].content.parts[0].inline_data and chunk.candidates[0].content.parts[0].inline_data.data:
            inline_data = chunk.candidates[0].content.parts[0].inline_data
            data_buffer = inline_data.data
            file_extension = mimetypes.guess_extension(inline_data.mime_type)

            # Use provided filename or generate one
            if file_index == 0 and filename:
                base_name = os.path.splitext(filename)[0]
                file_path = os.path.join(PRODUCTION_ASSETS_DIR, f"{base_name}{file_extension}")
            else:
                file_path = os.path.join(PRODUCTION_ASSETS_DIR, f"{filename}_{file_index}{file_extension}")

            save_binary_file(file_path, data_buffer)
            saved_files.append(file_path)
            file_index += 1
        else:
            if chunk.text:
                print(f"   Model response: {chunk.text}")

    if saved_files:
        return f"Image(s) saved: {', '.join(saved_files)}"
    else:
        return "No images were generated"


# ============================================================================
# Nano Banana Pro Image Generation
# ============================================================================

def create_nano_banana_task(
    prompt: str,
    image_inputs: Optional[List[str]] = None,
    aspect_ratio: str = "1:1",
    resolution: str = "1K",
    output_format: str = "png"
) -> str:
    """
    Create a Nano Banana Pro image generation task.

    Args:
        prompt: Text description of the image (max 5000 chars)
        image_inputs: Optional list of base64-encoded images (max 8 images, 30MB each)
        aspect_ratio: Image aspect ratio
        resolution: Image resolution
        output_format: Output file format

    Returns:
        taskId: Task ID for querying results
    """
    url = f"{NANO_BANANA_BASE_URL}/createTask"
    headers = {
        "Authorization": f"Bearer {NANO_BANANA_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": "nano-banana-pro",
        "input": {
            "prompt": prompt,
            "image_input": image_inputs or [],
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "output_format": output_format
        }
    }

    response = requests.post(url, json=payload, headers=headers)
    response.raise_for_status()

    result = response.json()
    if result["code"] == 200:
        return result["data"]["taskId"]
    else:
        raise Exception(f"Task creation failed: {result['msg']}")


def query_nano_banana_task(task_id: str, max_retries: int = 180, retry_interval: int = 2) -> dict:
    """
    Query Nano Banana Pro task status and results.

    Args:
        task_id: Task ID from create_nano_banana_task
        max_retries: Maximum number of polling attempts
        retry_interval: Seconds to wait between polls

    Returns:
        Task result data including resultUrls
    """
    url = f"{NANO_BANANA_BASE_URL}/recordInfo"
    headers = {
        "Authorization": f"Bearer {NANO_BANANA_API_KEY}"
    }

    for attempt in range(max_retries):
        response = requests.get(url, params={"taskId": task_id}, headers=headers)
        response.raise_for_status()

        result = response.json()
        if result["code"] != 200:
            raise Exception(f"Query failed: {result['msg']}")

        data = result["data"]
        state = data["state"]

        if state == "success":
            result_json = json.loads(data["resultJson"])
            return {
                "state": state,
                "resultUrls": result_json.get("resultUrls", []),
                "costTime": data.get("costTime"),
                "taskId": task_id
            }
        elif state == "fail":
            raise Exception(f"Task failed: {data['failMsg']} (code: {data['failCode']})")
        elif state == "waiting":
            print(f"   ⏳ Waiting... (attempt {attempt + 1}/{max_retries})")
            time.sleep(retry_interval)
        else:
            raise Exception(f"Unknown state: {state}")

    raise Exception(f"Task timeout after {max_retries * retry_interval} seconds")


def generate_image_nano(
    prompt: str,
    filename: str,
    reference_images_base64: Optional[List[Dict[str, str]]] = None,
    aspect_ratio: str = "1:1",
    resolution: str = "1K",
    output_format: str = "png",
    system_instruction: str = ""
) -> str:
    """
    Generate image using Nano Banana Pro API with optional reference images.

    Args:
        prompt: Text description of the image
        filename: Output filename (without extension)
        reference_images_base64: Optional list of dicts with 'data' (base64) and 'mime_type'
        aspect_ratio: Image aspect ratio
        resolution: Image resolution
        output_format: Output format (png or jpg)
        system_instruction: Additional style instruction

    Returns:
        Success message with saved file path
    """
    print(f"\n🎨 [Generating Image with Nano Banana] '{filename}'")
    print(f"   Prompt: {prompt[:100]}...")

    # Combine system instruction with prompt
    full_prompt = prompt
    if system_instruction:
        full_prompt = f"Style: {system_instruction}\n\n{prompt}"
        print(f"   System Instruction: {system_instruction}")

    # Prepare image inputs (extract base64 data only)
    image_inputs = []
    if reference_images_base64:
        print(f"   Reference Images: {len(reference_images_base64)} image(s)")
        for ref_img in reference_images_base64:
            image_inputs.append(ref_img['data'])

    # Create task
    print("   📤 Creating task...")
    task_id = create_nano_banana_task(
        prompt=full_prompt,
        image_inputs=image_inputs,
        aspect_ratio=aspect_ratio,
        resolution=resolution,
        output_format=output_format
    )
    print(f"   ✅ Task created: {task_id}")

    # Query results
    print("   ⏳ Waiting for results...")
    result = query_nano_banana_task(task_id)

    # Download and save images
    ensure_directory(PRODUCTION_ASSETS_DIR)
    saved_files = []

    for idx, image_url in enumerate(result["resultUrls"]):
        print(f"   📥 Downloading image {idx + 1}...")
        image_response = requests.get(image_url)
        image_response.raise_for_status()

        # Determine file extension
        ext = output_format if output_format in ['png', 'jpg'] else 'png'
        if idx == 0:
            file_path = os.path.join(PRODUCTION_ASSETS_DIR, f"{filename}.{ext}")
        else:
            file_path = os.path.join(PRODUCTION_ASSETS_DIR, f"{filename}_{idx}.{ext}")

        # Save file
        with open(file_path, "wb") as f:
            f.write(image_response.content)

        saved_files.append(file_path)
        print(f"   ✅ Saved: {file_path}")

    print(f"   ⏱️  Generation took {result['costTime']}ms")

    if saved_files:
        return f"Image(s) saved: {', '.join(saved_files)}"
    else:
        return "No images were generated"
