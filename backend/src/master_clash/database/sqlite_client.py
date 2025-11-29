"""
SQLite client for accessing the frontend database.

This allows the backend to create asset records in the frontend's SQLite database.
"""

import sqlite3
from pathlib import Path
from typing import Any


class FrontendDatabase:
    """Client for accessing the frontend SQLite database."""

    def __init__(self, db_path: str | Path = "../frontend/local.db"):
        """
        Initialize database client.

        Args:
            db_path: Path to frontend SQLite database (relative to backend root)
        """
        # Resolve path relative to backend directory
        backend_root = Path(__file__).parent.parent.parent.parent
        self.db_path = (backend_root / db_path).resolve()

        if not self.db_path.exists():
            raise FileNotFoundError(f"Frontend database not found: {self.db_path}")

        self.conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row  # Enable dict-like access

    def create_asset(
        self,
        name: str,
        project_id: str,
        storage_key: str,
        url: str,
        asset_type: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """
        Create a new asset record.

        Args:
            name: User-defined unique name within project
            project_id: Project ID
            storage_key: R2 object key
            url: Public R2 URL
            asset_type: Asset type (image/video/audio/text)
            metadata: Optional JSON metadata

        Returns:
            Asset ID (UUID)

        Raises:
            sqlite3.IntegrityError: If name already exists for this project
        """
        import json
        from uuid import uuid4

        asset_id = str(uuid4())
        metadata_json = json.dumps(metadata) if metadata else None

        cursor = self.conn.cursor()
        cursor.execute(
            """
            INSERT INTO asset (id, name, project_id, storage_key, url, type, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
            """,
            (asset_id, name, project_id, storage_key, url, asset_type, metadata_json),
        )
        self.conn.commit()

        return asset_id

    def get_asset_by_id(self, asset_id: str) -> dict[str, Any] | None:
        """
        Get asset by ID.

        Args:
            asset_id: Asset ID

        Returns:
            Asset record as dict, or None if not found
        """
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM asset WHERE id = ?", (asset_id,))
        row = cursor.fetchone()

        if row:
            return dict(row)
        return None

    def get_asset_by_name(self, name: str, project_id: str) -> dict[str, Any] | None:
        """
        Get asset by name within a project.

        Args:
            name: Asset name
            project_id: Project ID

        Returns:
            Asset record as dict, or None if not found
        """
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM asset WHERE name = ? AND project_id = ?",
            (name, project_id),
        )
        row = cursor.fetchone()

        if row:
            return dict(row)
        return None

    def list_project_assets(self, project_id: str) -> list[dict[str, Any]]:
        """
        List all assets for a project.

        Args:
            project_id: Project ID

        Returns:
            List of asset records
        """
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM asset WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        )
        rows = cursor.fetchall()

        return [dict(row) for row in rows]

    def delete_asset(self, asset_id: str) -> bool:
        """
        Delete an asset record.

        Args:
            asset_id: Asset ID

        Returns:
            True if asset was deleted, False if not found
        """
        cursor = self.conn.cursor()
        cursor.execute("DELETE FROM asset WHERE id = ?", (asset_id,))
        self.conn.commit()

        return cursor.rowcount > 0

    def close(self):
        """Close database connection."""
        self.conn.close()


# Singleton instance
_frontend_db: FrontendDatabase | None = None


def get_frontend_db() -> FrontendDatabase:
    """Get singleton frontend database instance."""
    global _frontend_db
    if _frontend_db is None:
        _frontend_db = FrontendDatabase()
    return _frontend_db
