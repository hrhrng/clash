"""Database integration for semantic ID generation.

Provides utilities to generate unique IDs with database collision detection.
Supports checking ID uniqueness within project scopes.
"""

from typing import Optional, Protocol

from .generator import SemanticIDGenerator


class IDChecker(Protocol):
    """Protocol for checking ID uniqueness in a database."""

    def id_exists(self, semantic_id: str, project_id: str) -> bool:
        """Check if a semantic ID exists in the given project.

        Args:
            semantic_id: The semantic ID to check.
            project_id: The project scope to check within.

        Returns:
            True if the ID exists, False otherwise.
        """
        ...


class InMemoryIDChecker:
    """In-memory ID checker for testing and development.

    Stores IDs in a dictionary keyed by project_id.
    """

    def __init__(self):
        """Initialize the in-memory checker."""
        self._ids: dict[str, set[str]] = {}

    def id_exists(self, semantic_id: str, project_id: str) -> bool:
        """Check if ID exists in project.

        Args:
            semantic_id: The semantic ID to check.
            project_id: The project scope to check within.

        Returns:
            True if the ID exists, False otherwise.
        """
        if project_id not in self._ids:
            return False
        return semantic_id in self._ids[project_id]

    def add_id(self, semantic_id: str, project_id: str) -> None:
        """Add an ID to the project scope.

        Args:
            semantic_id: The semantic ID to add.
            project_id: The project scope to add to.
        """
        if project_id not in self._ids:
            self._ids[project_id] = set()
        self._ids[project_id].add(semantic_id)

    def remove_id(self, semantic_id: str, project_id: str) -> None:
        """Remove an ID from the project scope.

        Args:
            semantic_id: The semantic ID to remove.
            project_id: The project scope to remove from.
        """
        if project_id in self._ids:
            self._ids[project_id].discard(semantic_id)

    def get_project_ids(self, project_id: str) -> set[str]:
        """Get all IDs for a project.

        Args:
            project_id: The project to get IDs for.

        Returns:
            Set of semantic IDs in the project.
        """
        return self._ids.get(project_id, set()).copy()


class DatabaseIDChecker:
    """Database-backed ID checker.

    Uses a database connection to check ID uniqueness.
    Can work with any database adapter that implements the Database protocol.
    """

    def __init__(self, db_connection):
        """Initialize with a database connection.

        Args:
            db_connection: Database connection implementing execute() method.
                         Should support parameterized queries.
        """
        self.db = db_connection

    def id_exists(self, semantic_id: str, project_id: str) -> bool:
        """Check if ID exists in the database.

        Args:
            semantic_id: The semantic ID to check.
            project_id: The project scope to check within.

        Returns:
            True if the ID exists, False otherwise.
        """
        # Query depends on your schema - adjust table/column names as needed
        query = """
            SELECT COUNT(*) as count
            FROM assets
            WHERE semantic_id = ? AND project_id = ?
        """

        try:
            result = self.db.fetchone(query, [semantic_id, project_id])
            if result:
                count = result.get("count", 0) if isinstance(result, dict) else result[0]
                return count > 0
            return False
        except Exception as e:
            # Log error but don't crash - safer to assume ID exists
            print(f"Warning: Database check failed for {semantic_id}: {e}")
            return True  # Conservative: assume ID exists on error


def generate_unique_id_for_project(
    project_id: str,
    checker: IDChecker,
    generator: Optional[SemanticIDGenerator] = None,
) -> str:
    """Generate a unique semantic ID for a project.

    Args:
        project_id: The project scope to generate ID for.
        checker: ID checker to verify uniqueness.
        generator: Optional custom generator. Creates default if None.

    Returns:
        A unique semantic ID string.

    Raises:
        RuntimeError: If unable to generate unique ID.

    Example:
        >>> checker = InMemoryIDChecker()
        >>> id1 = generate_unique_id_for_project("proj-123", checker)
        >>> print(id1)
        'alpha-ocean-square'
    """
    if generator is None:
        generator = SemanticIDGenerator()

    def is_unique(candidate: str) -> bool:
        return not checker.id_exists(candidate, project_id)

    return generator.generate_unique(is_unique, context=f"project:{project_id}")


def generate_unique_ids_for_project(
    project_id: str,
    count: int,
    checker: IDChecker,
    generator: Optional[SemanticIDGenerator] = None,
) -> list[str]:
    """Generate multiple unique semantic IDs for a project.

    Args:
        project_id: The project scope to generate IDs for.
        count: Number of unique IDs to generate.
        checker: ID checker to verify uniqueness.
        generator: Optional custom generator. Creates default if None.

    Returns:
        List of unique semantic ID strings.

    Raises:
        RuntimeError: If unable to generate enough unique IDs.
    """
    if generator is None:
        generator = SemanticIDGenerator()

    def is_unique(candidate: str) -> bool:
        return not checker.id_exists(candidate, project_id)

    return generator.generate_unique_batch(count, is_unique, context=f"project:{project_id}")


# Convenience functions for common use cases
def generate_asset_id(project_id: str, checker: IDChecker) -> str:
    """Generate a unique asset ID for a project.

    Args:
        project_id: The project scope.
        checker: ID checker.

    Returns:
        A unique semantic ID for an asset.
    """
    return generate_unique_id_for_project(project_id, checker)


def generate_shot_id(project_id: str, checker: IDChecker) -> str:
    """Generate a unique shot ID for a project.

    Args:
        project_id: The project scope.
        checker: ID checker.

    Returns:
        A unique semantic ID for a shot.
    """
    return generate_unique_id_for_project(project_id, checker)


def generate_scene_id(project_id: str, checker: IDChecker) -> str:
    """Generate a unique scene ID for a project.

    Args:
        project_id: The project scope.
        checker: ID checker.

    Returns:
        A unique semantic ID for a scene.
    """
    return generate_unique_id_for_project(project_id, checker)


if __name__ == "__main__":
    # Demo
    print("Database Integration Demo")
    print("=" * 60)

    # Create in-memory checker for demo
    checker = InMemoryIDChecker()

    # Generate some IDs for a project
    project = "project-123"
    print(f"\nGenerating IDs for {project}:")

    for i in range(5):
        new_id = generate_unique_id_for_project(project, checker)
        checker.add_id(new_id, project)  # Add to checker for next iteration
        print(f"  {i+1}. {new_id}")

    # Show all IDs for project
    all_ids = checker.get_project_ids(project)
    print(f"\nTotal IDs in {project}: {len(all_ids)}")

    # Test collision detection
    print("\nTesting collision detection:")
    existing_id = list(all_ids)[0]
    print(f"  Checking if '{existing_id}' exists: {checker.id_exists(existing_id, project)}")
    print(f"  Checking if 'fake-id-here' exists: {checker.id_exists('fake-id-here', project)}")

    # Generate batch
    print("\nGenerating batch of 3 IDs:")
    batch = generate_unique_ids_for_project(project, 3, checker)
    for i, id in enumerate(batch, 1):
        print(f"  {i}. {id}")
