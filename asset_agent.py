"""
Asset generation agent.
Generates reference images for characters and locations.
"""

from typing import Dict

from models import ScriptOutput
from image_generation import generate_image
from utils import image_to_base64, extract_file_paths
from prompts import get_character_prompt, get_location_prompt


def generate_assets(script: ScriptOutput) -> Dict[str, Dict]:
    """
    Generate reference images for characters and locations.

    Args:
        script: ScriptOutput object from script generation

    Returns:
        Dictionary mapping asset IDs to their image data
    """
    print("\n--- Running Agent 2: Asset Generation ---")

    asset_images = {}
    global_style_instruction = script.step_1_concept.global_aesthetic

    # Generate Character Reference Images
    print("\n🎭 Generating Character Reference Images...")
    for char in script.step_2_assets.characters:
        char_prompt = get_character_prompt(
            char.name,
            char.visual_anchor,
            global_style_instruction
        )

        filename = f"{char.id}_reference"
        result = generate_image.invoke({
            "prompt": char_prompt,
            "filename": filename,
            "system_instruction": global_style_instruction
        })

        # Store the path for later use
        file_paths = extract_file_paths(result)
        if file_paths:
            file_path = file_paths[0]
            asset_images[char.id] = {
                "path": file_path,
                "base64": image_to_base64(file_path),
                "mime_type": "image/png"
            }
        print(f"   ✅ {char.name}: {result}")

    # Generate Location Reference Images
    print("\n📍 Generating Location Reference Images...")
    for loc in script.step_2_assets.locations:
        loc_prompt = get_location_prompt(
            loc.name,
            loc.environment_anchor,
            global_style_instruction
        )

        filename = f"{loc.id}_reference"
        result = generate_image.invoke({
            "prompt": loc_prompt,
            "filename": filename,
            "system_instruction": global_style_instruction
        })

        # Store the path for later use
        file_paths = extract_file_paths(result)
        if file_paths:
            file_path = file_paths[0]
            asset_images[loc.id] = {
                "path": file_path,
                "base64": image_to_base64(file_path),
                "mime_type": "image/png"
            }
        print(f"   ✅ {loc.name}: {result}")

    print(f"\n✅ Asset Generation Complete! Generated {len(asset_images)} reference images.")
    return asset_images
