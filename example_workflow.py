"""
Example workflow showing how to use the modular video production system.
This can be run as a Python script or copied into a Jupyter notebook.
"""

# Step 0: Import modules
from config import print_config
from agents import generate_script, generate_assets, generate_shots, print_production_summary
import json

# Print current configuration
print_config()

# ============================================================================
# STEP 1: Generate Script from Story Idea
# ============================================================================

# Option A: Use a text story idea
user_input = "A sci-fi short about a robot finding a flower in a wasteland."

# Option B: Use a CSV file
# user_input = "回忆罐脚本.csv"

print("\n" + "="*60)
print("STEP 1: SCRIPT GENERATION")
print("="*60)

script_result = generate_script(user_input)

# Optionally save script to JSON
with open("output/script.json", "w", encoding="utf-8") as f:
    json.dump(script_result.model_dump(), f, indent=2, ensure_ascii=False)
print("\n💾 Script saved to output/script.json")

# ============================================================================
# STEP 2: Generate Character and Location References
# ============================================================================

print("\n" + "="*60)
print("STEP 2: ASSET GENERATION")
print("="*60)

asset_images = generate_assets(script_result)

# Access individual assets
print("\n📋 Generated Assets:")
for asset_id, asset_data in asset_images.items():
    print(f"  - {asset_id}: {asset_data['path']}")

# ============================================================================
# STEP 3: Generate Individual Shots
# ============================================================================

print("\n" + "="*60)
print("STEP 3: SHOT GENERATION")
print("="*60)

shot_images = generate_shots(script_result, asset_images)

# Access individual shots
print("\n🎬 Generated Shots:")
for shot in shot_images:
    print(f"  - Shot {shot['shot_id']}: {shot['result']}")

# ============================================================================
# STEP 4: Print Production Summary
# ============================================================================

print_production_summary(script_result, asset_images, shot_images)

# ============================================================================
# OPTIONAL: Advanced Usage
# ============================================================================

# You can also manually control each step:

# 1. Modify the script before generating assets
# script_result.step_1_concept.global_aesthetic = "Cyberpunk, neon lighting, dark atmosphere"

# 2. Generate only specific characters or locations
# for char in script_result.step_2_assets.characters:
#     if char.name == "Robot":
#         # Generate only robot character
#         pass

# 3. Generate shots selectively
# first_10_shots = script_result.step_3_sequence[:10]
# for shot in first_10_shots:
#     # Generate only first 10 shots
#     pass

# 4. Use different image generation backends
# from image_generation import generate_image_nano
# result = generate_image_nano(
#     prompt="Your prompt",
#     filename="test_image",
#     aspect_ratio="16:9",
#     resolution="2K"
# )

print("\n✅ Workflow complete!")
print("\n📁 Check the following directories:")
print("  - production_assets/: All generated images")
print("  - output/: Script JSON and other outputs")
