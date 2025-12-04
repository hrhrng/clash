#!/usr/bin/env python3
"""Test Cloudflare D1 database connection."""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from master_clash.config import get_settings
from master_clash.database.adapters.d1_adapter import D1Database
import os


def test_config():
    """Test that D1 configuration is loaded correctly."""
    print("=" * 60)
    print("Testing Configuration Loading")
    print("=" * 60)

    settings = get_settings()

    print(f"Cloudflare Account ID: {settings.cloudflare_account_id}")
    print(f"D1 Database ID: {settings.cloudflare_d1_database_id}")
    print(f"API Token: {'***' + settings.cloudflare_api_token[-4:] if settings.cloudflare_api_token else 'Not set'}")
    print(f"Use D1 Checkpointer: {settings.use_d1_checkpointer}")

    if not settings.use_d1_checkpointer:
        print("\n❌ D1 configuration is incomplete!")
        return False

    print("\n✅ D1 configuration is complete!")
    return True


def test_d1_adapter():
    """Test D1Database adapter connection."""
    print("\n" + "=" * 60)
    print("Testing D1Database Adapter Connection")
    print("=" * 60)

    try:
        # Set environment variables for D1Database
        settings = get_settings()
        os.environ["CF_ACCOUNT_ID"] = settings.cloudflare_account_id or ""
        os.environ["CF_API_TOKEN"] = settings.cloudflare_api_token or ""
        os.environ["D1_DATABASE_ID"] = settings.cloudflare_d1_database_id or ""

        # Create D1Database instance
        db = D1Database("master-clash-frontend")
        print(f"✅ D1Database instance created successfully")
        print(f"   Database name: master-clash-frontend")
        print(f"   Account ID: {settings.cloudflare_account_id}")
        print(f"   Database ID: {settings.cloudflare_d1_database_id}")

        # Test a simple query - list all tables
        print("\n📝 Testing simple query: SELECT name FROM sqlite_master WHERE type='table'")
        rows = db.fetchall("SELECT name FROM sqlite_master WHERE type='table'")

        if rows:
            print(f"✅ Query executed successfully!")
            print(f"   Found {len(rows)} tables:")
            for row in rows:
                print(f"   - {row.get('name', row)}")
        else:
            print("⚠️  Query executed but no tables found. Database might be empty.")

        return True

    except Exception as e:
        print(f"\n❌ D1Database test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_d1_checkpointer():
    """Test D1Checkpointer connection."""
    print("\n" + "=" * 60)
    print("Testing D1Checkpointer Connection")
    print("=" * 60)

    try:
        from master_clash.database.d1_checkpointer import D1Checkpointer

        settings = get_settings()

        # Create D1Checkpointer instance
        checkpointer = D1Checkpointer(
            account_id=settings.cloudflare_account_id or "",
            database_id=settings.cloudflare_d1_database_id or "",
            api_token=settings.cloudflare_api_token or "",
        )
        print(f"✅ D1Checkpointer instance created successfully")

        # Test a simple query to check if checkpoints table exists
        print("\n📝 Testing checkpoints table existence")
        result = checkpointer._execute_sql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='checkpoints'"
        )

        rows = result.get("result", [{}])[0].get("results", [])

        if rows:
            print(f"✅ Checkpoints table exists!")
        else:
            print("⚠️  Checkpoints table not found. Run migrations to create it.")

        return True

    except Exception as e:
        print(f"\n❌ D1Checkpointer test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all D1 connection tests."""
    print("\n🧪 Testing Cloudflare D1 Database Connection\n")

    success = True

    # Test 1: Configuration
    if not test_config():
        print("\n⚠️  Skipping connection tests due to missing configuration")
        return 1

    # Test 2: D1Database adapter
    if not test_d1_adapter():
        success = False

    # Test 3: D1Checkpointer
    if not test_d1_checkpointer():
        success = False

    # Summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)

    if success:
        print("✅ All D1 connection tests passed!")
        return 0
    else:
        print("❌ Some D1 connection tests failed. Check the output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
