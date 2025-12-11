"""Tests for utils module."""

import pytest
from master_clash.utils import find_best_match


def test_find_best_match():
    """Test find_best_match function."""
    candidates = ["apple", "banana", "cherry"]
    result = find_best_match("aple", candidates)
    assert result == "apple"


def test_find_best_match_no_match():
    """Test find_best_match with no good match."""
    candidates = ["apple", "banana"]
    result = find_best_match("xyz", candidates)
    assert result is None
