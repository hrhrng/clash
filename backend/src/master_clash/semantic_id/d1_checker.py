"""D1 Database ID Checker for semantic ID uniqueness.

Provides production-ready ID checking using Cloudflare D1 database.
Matches the existing asset table schema where semantic_id is stored in the 'id' field.
"""

from typing import Optional
import json

from master_clash.config import get_settings
from master_clash.database.adapters.d1_adapter import D1Database


class D1IDChecker:
    """Production ID checker using Cloudflare D1 database.

    Checks semantic ID uniqueness by querying the asset table in D1.

    Asset table schema:
        - id (TEXT, PRIMARY KEY): The semantic ID
        - name (TEXT, NOT NULL): Asset name
        - project_id (TEXT, NOT NULL): Project scope
        - storage_key (TEXT, NOT NULL): R2 storage key
        - url (TEXT, NOT NULL): Public URL
        - type (TEXT, NOT NULL): Asset type (image, video, etc.)
        - metadata (TEXT, NULLABLE): JSON metadata
        - created_at (INTEGER): Unix timestamp
    """

    def __init__(self, db: Optional[D1Database] = None):
        """Initialize D1 ID checker.

        Args:
            db: Optional D1Database instance. If None, creates one from settings.
        """
        if db is None:
            settings = get_settings()
            # Set environment variables for D1Database
            import os
            os.environ["CF_ACCOUNT_ID"] = settings.cloudflare_account_id or ""
            os.environ["CF_API_TOKEN"] = settings.cloudflare_api_token or ""
            os.environ["D1_DATABASE_ID"] = settings.cloudflare_d1_database_id or ""

            db = D1Database("master-clash-frontend")

        self.db = db

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
                count = result.get("count", 0) if isinstance(result, dict) else result[0]
                return count > 0

            return False

        except Exception as e:
            # Log error but be conservative: assume ID exists on error
            print(f"Warning: D1 check failed for {semantic_id} in {project_id}: {e}")
            return True  # Fail safe: assume ID exists to avoid duplicates

    def register_asset(
        self,
        semantic_id: str,
        project_id: str,
        name: str,
        storage_key: str,
        url: str,
        asset_type: str = "unknown",
        metadata: Optional[dict] = None,
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
                row.get("id", row[0]) if isinstance(row, dict) else row[0]
                for row in results
            ]

        except Exception as e:
            print(f"Error fetching project IDs for {project_id}: {e}")
            return []

    def get_asset(self, semantic_id: str, project_id: str) -> Optional[dict]:
        """Get asset details by semantic ID.

        Args:
            semantic_id: The semantic ID to look up.
            project_id: The project scope.

        Returns:
            Asset dictionary or None if not found.
        """
        try:
            query = """
                SELECT id, name, project_id, storage_key, url, type, metadata, created_at
                FROM asset
                WHERE id = ? AND project_id = ?
            """

            result = self.db.fetchone(query, [semantic_id, project_id])

            if result:
                asset = dict(result) if isinstance(result, dict) else {
                    "id": result[0],
                    "name": result[1],
                    "project_id": result[2],
                    "storage_key": result[3],
                    "url": result[4],
                    "type": result[5],
                    "metadata": result[6],
                    "created_at": result[7],
                }

                # Parse metadata JSON if present
                if asset.get("metadata"):
                    try:
                        asset["metadata"] = json.loads(asset["metadata"])
                    except:
                        pass

                return asset

            return None

        except Exception as e:
            print(f"Error fetching asset {semantic_id} in {project_id}: {e}")
            return None

    def id_count(self, project_id: str) -> int:
        """Get count of assets in a project.

        Args:
            project_id: The project to count assets for.

        Returns:
            Number of assets in the project.
        """
        try:
            query = """
                SELECT COUNT(*) as count
                FROM asset
                WHERE project_id = ?
            """

            result = self.db.fetchone(query, [project_id])

            if result:
                return result.get("count", 0) if isinstance(result, dict) else result[0]

            return 0

        except Exception as e:
            print(f"Error counting assets for {project_id}: {e}")
            return 0

    def delete_asset(self, semantic_id: str, project_id: str) -> bool:
        """Delete an asset by semantic ID.

        Args:
            semantic_id: The semantic ID to delete.
            project_id: The project scope.

        Returns:
            True if deleted, False if not found or error.
        """
        try:
            query = """
                DELETE FROM asset
                WHERE id = ? AND project_id = ?
            """

            self.db.execute(query, [semantic_id, project_id])
            self.db.commit()
            return True

        except Exception as e:
            print(f"Error deleting asset {semantic_id} in {project_id}: {e}")
            return False


def create_d1_checker() -> D1IDChecker:
    """Create a D1 ID checker with default settings.

    Returns:
        D1IDChecker instance configured from settings.
    """
    return D1IDChecker()


if __name__ == "__main__":
    # Demo and testing
    print("D1 ID Checker Demo (Matching Existing Schema)")
    print("=" * 60)

    # Create checker
    checker = create_d1_checker()

    # Test with a project
    project_id = "test-project-demo"
    test_id = "alpha-ocean-square"

    print(f"\nChecking if '{test_id}' exists in '{project_id}'...")
    exists = checker.id_exists(test_id, project_id)
    print(f"  Result: {exists}")

    if not exists:
        print(f"\nRegistering asset with ID '{test_id}' in '{project_id}'...")
        try:
            checker.register_asset(
                semantic_id=test_id,
                project_id=project_id,
                name="Demo Asset",
                storage_key=f"projects/{project_id}/assets/{test_id}",
                url=f"https://example.com/{test_id}",
                asset_type="image",
                metadata={"description": "Test asset", "tags": ["demo", "test"]},
            )
            print("  ✅ Registered successfully")

            # Verify registration
            exists = checker.id_exists(test_id, project_id)
            print(f"  Verification: {exists}")

            # Get asset details
            asset = checker.get_asset(test_id, project_id)
            print(f"  Asset details: {asset}")

        except Exception as e:
            print(f"  ❌ Registration failed: {e}")
    else:
        print(f"\nAsset '{test_id}' already exists in '{project_id}'")
        asset = checker.get_asset(test_id, project_id)
        if asset:
            print(f"  Details: {asset}")

    # Show project stats
    print(f"\nProject '{project_id}' statistics:")
    count = checker.id_count(project_id)
    print(f"  Total assets: {count}")

    if count > 0:
        ids = checker.get_project_ids(project_id)
        print(f"  All asset IDs:")
        for i, asset_id in enumerate(ids, 1):
            print(f"    {i}. {asset_id}")
