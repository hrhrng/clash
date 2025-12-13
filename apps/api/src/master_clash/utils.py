"""
Utility functions for the video production system.
Contains helper functions for file operations and data processing.
"""

import base64
import os

import pandas as pd


def save_binary_file(file_name: str, data: bytes) -> None:
    """
    Save binary data to a file.

    Args:
        file_name: Path to the output file
        data: Binary data to save
    """
    with open(file_name, "wb") as f:
        f.write(data)
    print(f"✅ File saved to: {file_name}")


def image_to_base64(image_path: str) -> str:
    """
    Convert image file to base64 string.

    Args:
        image_path: Path to the image file

    Returns:
        Base64 encoded string of the image
    """
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode('utf-8')


def base64_to_bytes(base64_string: str) -> bytes:
    """
    Convert base64 string to bytes.

    Args:
        base64_string: Base64 encoded string

    Returns:
        Decoded bytes
    """
    return base64.b64decode(base64_string)


def load_input_data(source: str) -> str:
    """
    Load input data from text or CSV file.

    Args:
        source: File path or text string

    Returns:
        Processed content as string (CSV converted to markdown)
    """
    if source.endswith(".csv") and os.path.exists(source):
        df = pd.read_csv(source)
        return str(df.to_markdown(index=False))
    return source


def ensure_directory(directory: str) -> None:
    """
    Ensure a directory exists, create if it doesn't.

    Args:
        directory: Path to the directory
    """
    os.makedirs(directory, exist_ok=True)


def extract_file_paths(result_message: str) -> list[str]:
    """
    Extract file paths from result message.

    Args:
        result_message: Message containing file paths

    Returns:
        List of extracted file paths
    """
    if "saved" in result_message.lower() and ": " in result_message:
        paths_str = result_message.split(": ", 1)[1].strip()
        return [p.strip() for p in paths_str.split(",")]
    return []


def create_reference_image_dict(file_path: str, mime_type: str = "image/png") -> dict[str, str]:
    """
    Create a reference image dictionary with base64 encoding.

    Args:
        file_path: Path to the image file
        mime_type: MIME type of the image

    Returns:
        Dictionary with path, base64 data, and mime_type
    """
    return {
        "path": file_path,
        "base64": image_to_base64(file_path),
        "mime_type": mime_type
    }

def save_base64_image(base64_string: str, output_path: str) -> str:
    """
    Convert a base64-encoded image to a file and save it.

    Args:
        base64_string: Base64 encoded image data (may include a data URI prefix).
        output_path: Destination file path to write the image.

    Returns:
        The output_path that was written.
    """
    # Remove data URI prefix if present
    if base64_string.startswith("data:") and "," in base64_string:
        base64_string = base64_string.split(",", 1)[1]

    dir_name = os.path.dirname(output_path)
    if dir_name:
        ensure_directory(dir_name)

    data = base64_to_bytes(base64_string)
    save_binary_file(output_path, data)
    return output_path


def download_video(url: str, output_path: str) -> str:
    """
    Download video from URL and save to file.

    Args:
        url: Video URL to download
        output_path: Destination file path

    Returns:
        The output_path that was written
    """
    import requests

    dir_name = os.path.dirname(output_path)
    if dir_name:
        ensure_directory(dir_name)

    response = requests.get(url, stream=True)
    response.raise_for_status()

    with open(output_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    print(f"✅ Video saved to: {output_path}")
    return output_path


def image_message_part_template(image_data: str) -> dict:
    """
    Create a message part for an image given its base64 data.
    Args:
        image_data: Base64-encoded image data
    Returns:
        Dictionary representing the image message part
    """
    return {
        "type": "image_url",
        "image_url": {"url": f"data:image/jpeg;base64,{image_data}"},
    }


def text_message_part_template(text: str) -> dict:
    """
    Create a message part for text content.
    Args:
        text: Text content
    Returns:
        Dictionary representing the text message part
    """
    return {
        "type": "text",
        "text": text,
    }


def get_asset_base64(asset_url: str) -> tuple[str, str]:
    """
    Helper to get base64 data and mime type from a URL or Data URI.

    Args:
        asset_url: URL or Data URI

    Returns:
        Tuple of (base64_data, mime_type)
    """
    import base64
    import mimetypes

    import requests

    if asset_url.startswith("data:"):
        # Parse data URI
        header, data = asset_url.split(",", 1)
        mime_type = header.split(":")[1].split(";")[0]
        return data, mime_type
    else:
        # Fetch from URL
        response = requests.get(asset_url)
        response.raise_for_status()
        content = response.content

        # Guess mime type
        mime_type = response.headers.get("Content-Type")
        if not mime_type or mime_type == "application/octet-stream":
            mime_type = mimetypes.guess_type(asset_url)[0] or (
                "image/png" if not asset_url.endswith(".mp4") else "video/mp4"
            )

        base64_data = base64.b64encode(content).decode("utf-8")
        return base64_data, mime_type
