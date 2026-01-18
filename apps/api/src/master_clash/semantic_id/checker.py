"""Database-agnostic Semantic ID Checker.

This module provides a generic ID checker that works with any database adapter
(SQLite, PostgreSQL) through the Database port interface.
"""

import contextlib
import json

from master_clash.database.di import get_database
from master_clash.database.ports import Database


class IDChecker:
    """Generic ID checker using the configured database.

    Checks semantic ID uniqueness by querying the asset table.
    Works with both SQLite and PostgreSQL.
    """

    def __init__(self, db: Database | None = None):
        """Initialize ID checker.

        Args:
            db: Optional Database instance. If None, retrieves from dependency injection.
        """
        self.db = db or get_database()

    def id_exists(self, semantic_id: str, project_id: str) -> bool:
        """Check if a semantic ID exists in the database for a given project.

        Args:
            semantic_id: The semantic ID to check (stored in asset.id).
            project_id: The project scope to check within.

        Returns:
            True if the ID exists in the project, False otherwise.
        """
        try:
            query = """
                SELECT COUNT(*) as count
                FROM asset
                WHERE id = ? AND project_id = ?
            """

            result = self.db.fetchone(query, [semantic_id, project_id])

            if result:
                # Handle different return formats (dict-like or tuple/list)
                if hasattr(result, "get"):
                    count = result.get("count", 0)
                elif hasattr(result, "__getitem__"):
                    count = result[0]
                else:
                    count = 0
                return count > 0

            return False

        except Exception as e:
            # Log error but be conservative: assume ID exists on error
            print(f"Warning: DB check failed for {semantic_id} in {project_id}: {e}")
            return True  # Fail safe: assume ID exists to avoid duplicates

    def register_asset(
        self,
        semantic_id: str,
        project_id: str,
        name: str,
        storage_key: str,
        url: str,
        asset_type: str = "unknown",
        metadata: dict | None = None,
    ) -> None:
        """Register a new asset with a semantic ID in the database.

        Args:
            semantic_id: The semantic ID to use as primary key.
            project_id: The project the asset belongs to.
            name: Human-readable name for the asset.
            storage_key: R2 storage key.
            url: Public URL to access the asset.
            asset_type: Asset type (image, video, audio, etc.).
            metadata: Optional JSON metadata dictionary.

        Raises:
            Exception: If registration fails (e.g., duplicate ID).
        """
        query = """
            INSERT INTO asset (id, name, project_id, storage_key, url, type, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """

        metadata_json = json.dumps(metadata) if metadata else None

        params = [
            semantic_id,
            name,
            project_id,
            storage_key,
            url,
            asset_type,
            metadata_json,
        ]

        try:
            self.db.execute(query, params)
            self.db.commit()
        except Exception as e:
            print(f"Error registering asset {semantic_id} in {project_id}: {e}")
            raise

    def get_project_ids(self, project_id: str) -> list[str]:
        """Get all semantic IDs for a project.

        Args:
            project_id: The project to get IDs for.

        Returns:
            List of semantic IDs in the project.
        """
        try:
            query = """
                SELECT id
                FROM asset
                WHERE project_id = ?
                ORDER BY created_at DESC
            """

            results = self.db.fetchall(query, [project_id])
            return [
                (row.get("id", row[0]) if hasattr(row, "get") else row[0])
                for row in results
            ]

        except Exception as e:
            print(f"Error fetching project IDs for {project_id}: {e}")
            return []


def create_id_checker() -> IDChecker:
    """Create a default ID checker.

    Returns:
        IDChecker instance using the configured database.
    """
    return IDChecker()
