"""
Utility functions for the video production system.
Contains helper functions for file operations and data processing.
"""

import base64
import os
import pandas as pd
from typing import Dict, List


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
        return df.to_markdown(index=False)
    return source


def ensure_directory(directory: str) -> None:
    """
    Ensure a directory exists, create if it doesn't.

    Args:
        directory: Path to the directory
    """
    os.makedirs(directory, exist_ok=True)


def extract_file_paths(result_message: str) -> List[str]:
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


def create_reference_image_dict(file_path: str, mime_type: str = "image/png") -> Dict[str, str]:
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
