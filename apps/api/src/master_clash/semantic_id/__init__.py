"""Semantic ID generation system.

This module provides human-readable, memorable IDs for assets and resources.
IDs are composed of three words from carefully curated wordlists, forming
identifiers like "alpha-ocean-square" or "beta-mountain-circle".
"""

from .checker import IDChecker, create_id_checker
from .db_integration import (
    InMemoryIDChecker,
    generate_unique_id_for_project,
    generate_unique_ids_for_project,
)
from .generator import SemanticIDGenerator, generate_semantic_id
from .wordlists import (
    ALL_WORDLISTS,
    GEOMETRY_ABSTRACT_WORDS,
    NATURE_ELEMENTS_WORDS,
    TECH_SCIENCE_WORDS,
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
    # Database checker (Postgres/SQLite)
    "IDChecker",
    "create_id_checker",
    # In-memory checker (testing)
    "InMemoryIDChecker",
    # Convenience functions
    "generate_unique_id_for_project",
    "generate_unique_ids_for_project",
]
