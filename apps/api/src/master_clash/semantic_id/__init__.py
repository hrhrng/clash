"""Semantic ID generation system.

This module provides human-readable, memorable IDs for assets and resources.
IDs are composed of three words from carefully curated wordlists, forming
identifiers like "alpha-ocean-square" or "beta-mountain-circle".
"""

from .generator import SemanticIDGenerator, generate_semantic_id
from .wordlists import (
    TECH_SCIENCE_WORDS,
    NATURE_ELEMENTS_WORDS,
    GEOMETRY_ABSTRACT_WORDS,
    ALL_WORDLISTS,
)
from .d1_checker import D1IDChecker, create_d1_checker
from .db_integration import (
    InMemoryIDChecker,
    generate_unique_id_for_project,
    generate_unique_ids_for_project,
)

__all__ = [
    # Core generator
    "SemanticIDGenerator",
    "generate_semantic_id",
    # Wordlists
    "TECH_SCIENCE_WORDS",
    "NATURE_ELEMENTS_WORDS",
    "GEOMETRY_ABSTRACT_WORDS",
    "ALL_WORDLISTS",
    # D1 Database checker (production)
    "D1IDChecker",
    "create_d1_checker",
    # In-memory checker (testing)
    "InMemoryIDChecker",
    # Convenience functions
    "generate_unique_id_for_project",
    "generate_unique_ids_for_project",
]
