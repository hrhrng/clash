"""Tests for models module."""

import pytest
from master_clash.models import Shot, Script


def test_shot_creation():
    """Test creating a Shot instance."""
    shot = Shot(
        shot_number=1,
        description="A beautiful sunset over mountains",
        duration=5.0,
    )
    assert shot.shot_number == 1
    assert shot.duration == 5.0


def test_script_creation():
    """Test creating a Script instance."""
    script = Script(
        title="Test Script",
        shots=[],
    )
    assert script.title == "Test Script"
    assert len(script.shots) == 0
