#!/usr/bin/env python3
"""
Complete example of semantic ID system with D1 database integration.

This demonstrates how to use the semantic ID generator with the actual
Cloudflare D1 database for production use.
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from master_clash.semantic_id import (
    create_d1_checker,
    generate_unique_id_for_project,
)


def example_1_generate_asset_ids():
    """Example 1: Generate unique asset IDs for a project."""
    print("=" * 60)
    print("Example 1: Generate Asset IDs with D1 Database")
    print("=" * 60)

    # Create D1 checker (connects to real database)
    checker = create_d1_checker()

    # Your project ID
    project_id = "my-video-project-001"

    print(f"\nGenerating 3 unique asset IDs for project: {project_id}")

    # Generate 3 unique IDs
    for i in range(3):
        # This checks the database to ensure uniqueness
        asset_id = generate_unique_id_for_project(project_id, checker)
        print(f"  {i+1}. {asset_id}")

        # Note: These IDs are generated but NOT registered in the database yet
        # You need to call register_asset() to actually save them


def example_2_register_full_asset():
    """Example 2: Generate ID and register complete asset."""
    print("\n" + "=" * 60)
    print("Example 2: Generate ID and Register Full Asset")
    print("=" * 60)

    checker = create_d1_checker()
    project_id = "my-video-project-001"

    # Step 1: Generate unique ID
    asset_id = generate_unique_id_for_project(project_id, checker)
    print(f"\n✅ Generated semantic ID: {asset_id}")

    # Step 2: Register the complete asset in database
    try:
        checker.register_asset(
            semantic_id=asset_id,
            project_id=project_id,
            name="Hero Shot - Opening Scene",
            storage_key=f"projects/{project_id}/videos/{asset_id}.mp4",
            url=f"https://pub-xxx.r2.dev/projects/{project_id}/videos/{asset_id}.mp4",
            asset_type="video",
            metadata={
                "duration": 5.2,
                "resolution": "1920x1080",
                "fps": 30,
                "tags": ["hero", "opening", "main"],
            },
        )
        print(f"✅ Asset registered successfully in database")

        # Step 3: Verify it exists
        exists = checker.id_exists(asset_id, project_id)
        print(f"✅ Verification check: {exists}")

        # Step 4: Retrieve asset details
        asset = checker.get_asset(asset_id, project_id)
        print(f"\n📦 Asset Details:")
        print(f"   ID: {asset['id']}")
        print(f"   Name: {asset['name']}")
        print(f"   Type: {asset['type']}")
        print(f"   URL: {asset['url']}")
        print(f"   Metadata: {asset['metadata']}")

    except Exception as e:
        print(f"❌ Error: {e}")


def example_3_check_existing_ids():
    """Example 3: Check existing IDs in a project."""
    print("\n" + "=" * 60)
    print("Example 3: List All Asset IDs in Project")
    print("=" * 60)

    checker = create_d1_checker()
    project_id = "my-video-project-001"

    # Get count
    count = checker.id_count(project_id)
    print(f"\n📊 Project '{project_id}' has {count} assets")

    if count > 0:
        # Get all IDs
        asset_ids = checker.get_project_ids(project_id)
        print(f"\n📋 Asset IDs:")
        for i, aid in enumerate(asset_ids, 1):
            # Get details for each
            asset = checker.get_asset(aid, project_id)
            print(f"   {i}. {aid}")
            print(f"      Name: {asset['name']}")
            print(f"      Type: {asset['type']}")


def example_4_llm_friendly_workflow():
    """Example 4: LLM-friendly workflow for AI systems."""
    print("\n" + "=" * 60)
    print("Example 4: LLM-Friendly Workflow")
    print("=" * 60)

    checker = create_d1_checker()
    project_id = "my-video-project-001"

    # Simulate LLM creating multiple shots
    shots = [
        {"name": "Opening shot - sunrise", "type": "video"},
        {"name": "Character entrance", "type": "video"},
        {"name": "Dramatic close-up", "type": "video"},
    ]

    print(f"\n🤖 AI is creating {len(shots)} shots:")
    generated_ids = []

    for shot in shots:
        # Generate ID
        shot_id = generate_unique_id_for_project(project_id, checker)

        print(f"\n   Created shot: {shot_id}")
        print(f"   - {shot['name']}")

        # In a real scenario, you would:
        # 1. Generate the video content
        # 2. Upload to R2
        # 3. Register in database
        # For demo, we just print the ID

        generated_ids.append(shot_id)

    print(f"\n✅ Generated {len(generated_ids)} semantic IDs:")
    for shot_id in generated_ids:
        print(f"   - {shot_id}")

    print(f"\n💬 LLM can now reference these shots by ID:")
    print(f'   "Please edit {generated_ids[0]} to add a fade-in effect"')
    print(f'   "Combine {generated_ids[1]} and {generated_ids[2]} into a sequence"')


def example_5_collision_handling():
    """Example 5: Demonstrate collision detection."""
    print("\n" + "=" * 60)
    print("Example 5: Collision Detection")
    print("=" * 60)

    checker = create_d1_checker()
    project_id = "collision-test-project"

    print(f"\n🔍 Testing collision detection...")
    print(f"   The system will automatically retry if a duplicate is generated")

    # Generate 10 IDs - system handles collisions automatically
    ids = []
    for i in range(10):
        new_id = generate_unique_id_for_project(project_id, checker)
        ids.append(new_id)
        print(f"   {i+1:2d}. {new_id}")

    # Verify all are unique
    unique_count = len(set(ids))
    print(f"\n✅ Generated {len(ids)} IDs, all unique: {unique_count == len(ids)}")


def main():
    """Run all examples."""
    print("\n🎯 Semantic ID System - Complete Usage Examples")
    print("Using Cloudflare D1 Database\n")

    try:
        # Run examples
        example_1_generate_asset_ids()
        example_2_register_full_asset()
        example_3_check_existing_ids()
        example_4_llm_friendly_workflow()
        example_5_collision_handling()

        print("\n" + "=" * 60)
        print("✅ All examples completed successfully!")
        print("=" * 60)

        return 0

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
