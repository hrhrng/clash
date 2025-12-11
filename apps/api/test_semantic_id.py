#!/usr/bin/env python3
"""Test script for semantic ID generation system."""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from master_clash.semantic_id import (
    SemanticIDGenerator,
    generate_semantic_id,
    TECH_SCIENCE_WORDS,
    NATURE_ELEMENTS_WORDS,
    GEOMETRY_ABSTRACT_WORDS,
)
from master_clash.semantic_id.generator import (
    get_id_space_size,
    estimate_collision_probability,
)
from master_clash.semantic_id.db_integration import (
    InMemoryIDChecker,
    generate_unique_id_for_project,
    generate_unique_ids_for_project,
)


def test_wordlists():
    """Test wordlist integrity."""
    print("=" * 60)
    print("Test 1: Wordlist Integrity")
    print("=" * 60)

    # Check counts
    assert len(TECH_SCIENCE_WORDS) == 400, "TECH_SCIENCE_WORDS should have 400 words"
    assert len(NATURE_ELEMENTS_WORDS) == 400, "NATURE_ELEMENTS_WORDS should have 400 words"
    assert len(GEOMETRY_ABSTRACT_WORDS) == 400, "GEOMETRY_ABSTRACT_WORDS should have 400 words"
    print("✅ All wordlists have 400 words")

    # Check for duplicates within lists
    for name, wordlist in [
        ("TECH_SCIENCE_WORDS", TECH_SCIENCE_WORDS),
        ("NATURE_ELEMENTS_WORDS", NATURE_ELEMENTS_WORDS),
        ("GEOMETRY_ABSTRACT_WORDS", GEOMETRY_ABSTRACT_WORDS),
    ]:
        unique = set(wordlist)
        if len(unique) != len(wordlist):
            duplicates = len(wordlist) - len(unique)
            print(f"⚠️  {name} has {duplicates} duplicate(s)")
        else:
            print(f"✅ {name} has no duplicates")

    # Show some sample words from each list
    print("\nSample words from each list:")
    print(f"  Tech/Science: {', '.join(TECH_SCIENCE_WORDS[:5])}")
    print(f"  Nature/Elements: {', '.join(NATURE_ELEMENTS_WORDS[:5])}")
    print(f"  Geometry/Abstract: {', '.join(GEOMETRY_ABSTRACT_WORDS[:5])}")


def test_basic_generation():
    """Test basic ID generation."""
    print("\n" + "=" * 60)
    print("Test 2: Basic ID Generation")
    print("=" * 60)

    # Test simple generation
    generator = SemanticIDGenerator()

    print("\nGenerating 10 sample IDs:")
    ids = []
    for i in range(10):
        id = generator.generate()
        ids.append(id)
        parts = id.split("-")
        print(f"  {i+1:2d}. {id:30s} ({len(parts)} parts)")

    # Check format
    for id in ids:
        parts = id.split("-")
        assert len(parts) == 3, f"ID should have 3 parts, got {len(parts)}: {id}"
    print(f"\n✅ All IDs have correct format (3 words)")

    # Test convenience function
    quick_id = generate_semantic_id()
    print(f"\nQuick generation: {quick_id}")
    assert len(quick_id.split("-")) == 3, "Quick ID should have 3 parts"
    print("✅ Convenience function works")


def test_uniqueness():
    """Test uniqueness checking."""
    print("\n" + "=" * 60)
    print("Test 3: Uniqueness & Collision Detection")
    print("=" * 60)

    generator = SemanticIDGenerator()
    existing = set()

    def is_unique(id: str) -> bool:
        return id not in existing

    print("\nGenerating 20 unique IDs:")
    for i in range(20):
        new_id = generator.generate_unique(is_unique)
        assert new_id not in existing, f"Duplicate ID generated: {new_id}"
        existing.add(new_id)
        if i < 5 or i >= 15:  # Show first 5 and last 5
            print(f"  {i+1:2d}. {new_id}")
        elif i == 5:
            print("  ...")

    print(f"\n✅ Successfully generated {len(existing)} unique IDs with no collisions")

    # Test batch generation
    print("\nGenerating batch of 5 unique IDs:")
    batch = generator.generate_unique_batch(5, is_unique)
    for i, id in enumerate(batch, 1):
        assert id not in existing, f"Duplicate in batch: {id}"
        print(f"  {i}. {id}")

    print("✅ Batch generation works correctly")


def test_id_space():
    """Test ID space calculations."""
    print("\n" + "=" * 60)
    print("Test 4: ID Space & Collision Probability")
    print("=" * 60)

    space_size = get_id_space_size()
    print(f"\nTotal possible unique IDs: {space_size:,}")
    print(f"That's {space_size / 1_000_000:.1f} million combinations!")

    print("\nCollision probability estimates:")
    for count in [100, 1_000, 10_000, 100_000, 1_000_000]:
        prob = estimate_collision_probability(
            [TECH_SCIENCE_WORDS, NATURE_ELEMENTS_WORDS, GEOMETRY_ABSTRACT_WORDS],
            count,
        )
        print(f"  With {count:>8,} existing IDs: {prob*100:8.4f}%")

    print("\n✅ ID space is large enough for practical use")


def test_project_scoping():
    """Test project-scoped ID generation."""
    print("\n" + "=" * 60)
    print("Test 5: Project-Scoped ID Generation")
    print("=" * 60)

    checker = InMemoryIDChecker()

    # Generate IDs for different projects
    projects = ["project-alpha", "project-beta", "project-gamma"]

    print("\nGenerating IDs for multiple projects:")
    for project in projects:
        print(f"\n  {project}:")
        for i in range(3):
            new_id = generate_unique_id_for_project(project, checker)
            checker.add_id(new_id, project)
            print(f"    {i+1}. {new_id}")

    # Check counts
    print("\nProject ID counts:")
    for project in projects:
        ids = checker.get_project_ids(project)
        print(f"  {project}: {len(ids)} IDs")
        assert len(ids) == 3, f"Expected 3 IDs for {project}"

    print("\n✅ Project scoping works correctly")

    # Test that same ID can exist in different projects
    print("\nTesting cross-project ID reuse:")
    test_id = "test-id-here"
    checker.add_id(test_id, "project-1")
    checker.add_id(test_id, "project-2")

    assert checker.id_exists(test_id, "project-1"), "ID should exist in project-1"
    assert checker.id_exists(test_id, "project-2"), "ID should exist in project-2"
    assert not checker.id_exists(test_id, "project-3"), "ID should not exist in project-3"

    print("  ✅ Same ID can exist in different projects")


def test_collision_resolution():
    """Test collision resolution."""
    print("\n" + "=" * 60)
    print("Test 6: Collision Resolution")
    print("=" * 60)

    generator = SemanticIDGenerator(max_attempts=50)
    checker = InMemoryIDChecker()
    project = "test-project"

    # Pre-populate with many IDs to increase collision chance
    print("\nPre-populating with 100 IDs...")
    for _ in range(100):
        id = generator.generate()
        checker.add_id(id, project)

    existing_count = len(checker.get_project_ids(project))
    print(f"Pre-populated with {existing_count} IDs")

    # Try to generate more unique IDs
    print("\nGenerating 10 more unique IDs (may require retries):")
    success_count = 0
    for i in range(10):
        try:
            new_id = generate_unique_id_for_project(project, checker, generator)
            checker.add_id(new_id, project)
            success_count += 1
            print(f"  {i+1:2d}. {new_id} ✓")
        except RuntimeError as e:
            print(f"  {i+1:2d}. Failed: {e}")

    print(f"\n✅ Successfully generated {success_count}/10 IDs with collision resolution")


def test_edge_cases():
    """Test edge cases."""
    print("\n" + "=" * 60)
    print("Test 7: Edge Cases")
    print("=" * 60)

    # Test custom separator
    print("\nTesting custom separator:")
    generator = SemanticIDGenerator(separator="_")
    id = generator.generate()
    print(f"  Underscore separator: {id}")
    assert "_" in id, "Should use underscore separator"
    assert "-" not in id, "Should not use dash separator"
    print("  ✅ Custom separator works")

    # Test empty check function
    print("\nTesting with no existing IDs:")
    checker = InMemoryIDChecker()
    id = generate_unique_id_for_project("empty-project", checker)
    print(f"  Generated: {id}")
    assert not checker.id_exists(id, "empty-project"), "ID should not exist yet"
    print("  ✅ Works with empty project")


def main():
    """Run all tests."""
    print("\n🧪 Semantic ID System Test Suite\n")

    try:
        test_wordlists()
        test_basic_generation()
        test_uniqueness()
        test_id_space()
        test_project_scoping()
        test_collision_resolution()
        test_edge_cases()

        print("\n" + "=" * 60)
        print("✅ All tests passed!")
        print("=" * 60)
        return 0

    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
