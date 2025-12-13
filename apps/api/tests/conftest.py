"""Pytest configuration and fixtures."""

import pytest


@pytest.fixture
def sample_config():
    """Sample configuration for testing."""
    return {
        "model": "gemini-2.0-flash-exp",
        "temperature": 0.7,
    }
