#!/usr/bin/env python3
"""Initialize the Master Clash database.

This script sets up the SQLite/D1 database with all required tables
for LangGraph checkpointing and metadata tracking.
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from master_clash.database import init_database


def main():
    """Initialize the database."""
    print("Initializing Master Clash database...")
    print("-" * 60)

    try:
        init_database()
        print("-" * 60)
        print("✓ Database initialized successfully!")
        print("\nYou can now use LangGraph workflows with checkpoint support.")
        print("\nNext steps:")
        print("  1. Configure DATABASE_URL in your .env file (sqlite or postgres/neon)")
        print("  2. Run: python examples/workflow_with_checkpoints.py")
        print("  3. Check docs/D1_INTEGRATION.md for D1 and README for Postgres/Neon notes")

    except Exception as e:
        print(f"\n❌ Error initializing database: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
