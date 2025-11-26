"""
Shot generation agent.
Generates keyframe images for individual shots.
"""

from typing import Dict, List

from models import ScriptOutput
from image_generation import generate_image
from prompts import get_shot_prompt


def generate_shots(script: ScriptOutput, asset_images: Dict[str, Dict]) -> List[Dict]:
    """
    Generate individual shot images based on script and asset references.

    Args:
        script: ScriptOutput object from script generation
        asset_images: Dictionary of asset images from asset generation

    Returns:
        List of shot generation results
    """
    print("\n--- Running Agent 3: Shot Generation ---")

    shot_images = []
    global_style_instruction = script.step_1_concept.global_aesthetic

    for shot in script.step_3_sequence:
        print(f"\n🎬 Generating Shot {shot.shot_id}...")
        print(f"   Narrative Beat: {shot.narrative_beat}")

        # Build reference images list (characters + location)
        reference_images = []

        # Add character references
        for char_id in shot.char_ids:
            if char_id in asset_images:
                reference_images.append({
                    "data": asset_images[char_id]["base64"],
                    "mime_type": asset_images[char_id]["mime_type"]
                })

        # Add location reference
        if shot.scene_id in asset_images:
            reference_images.append({
                "data": asset_images[shot.scene_id]["base64"],
                "mime_type": asset_images[shot.scene_id]["mime_type"]
            })

        # Build detailed shot prompt
        shot_prompt = get_shot_prompt(shot)

        filename = f"shot_{shot.shot_id:03d}"
        result = generate_image.invoke({
            "prompt": shot_prompt,
            "filename": filename,
            "reference_images_base64": reference_images if reference_images else None,
            "system_instruction": global_style_instruction
        })

        shot_images.append({
            "shot_id": shot.shot_id,
            "result": result
        })

        print(f"   ✅ {result}")

    print(f"\n🎉 Shot Generation Complete! Generated {len(shot_images)} shots.")
    return shot_images


def print_production_summary(script: ScriptOutput, asset_images: Dict, shot_images: List[Dict]) -> None:
    """
    Print a summary of the production.

    Args:
        script: ScriptOutput object
        asset_images: Dictionary of asset images
        shot_images: List of shot generation results
    """
    print("\n" + "="*60)
    print("PRODUCTION SUMMARY")
    print("="*60)
    print(f"📖 Title: {script.step_1_concept.story_outline[:80]}...")
    print(f"🎨 Style: {script.step_1_concept.global_aesthetic}")
    print(f"👥 Characters Generated: {len([k for k in asset_images.keys() if k.startswith('char')])}")
    print(f"📍 Locations Generated: {len([k for k in asset_images.keys() if k.startswith('loc')])}")
    print(f"🎬 Total Shots: {len(shot_images)}")
    print(f"⏱️  Estimated Duration: {sum(shot.duration_sec for shot in script.step_3_sequence)} seconds")
    print("="*60)
