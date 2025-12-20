"""
Quick test script for Loro sync client

Run this to test if the Loro sync client works correctly.

Usage:
    python test_loro_sync.py
"""

import asyncio
import logging
from src.master_clash.tools.loro_sync_client import LoroSyncClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_loro_sync():
    """Test Loro sync client"""
    print("🚀 Testing Loro Sync Client")
    print("=" * 50)

    # Initialize client
    client = LoroSyncClient(
        project_id="test_project_123",
        sync_server_url="ws://localhost:8787"
    )

    try:
        # Connect
        print("\n1. Connecting to sync server...")
        await client.connect()
        print("✅ Connected!")

        # Wait a bit for connection to establish
        await asyncio.sleep(1)

        # Add a test node
        print("\n2. Adding test node...")
        client.add_node("test_node_image_cat", {
            "id": "test_node_image_cat",
            "type": "action-badge-image",
            "position": {"x": 100, "y": 200},
            "data": {
                "label": "Test Cat Image",
                "status": "idle"
            }
        })
        print("✅ Node added!")

        # Add an edge
        print("\n3. Adding test edge...")
        client.add_edge("test_edge_1", {
            "id": "test_edge_1",
            "source": "upstream_node",
            "target": "test_node_image_cat",
            "type": "default"
        })
        print("✅ Edge added!")

        # Get all nodes
        print("\n4. Getting all nodes...")
        nodes = client.get_all_nodes()
        print(f"✅ Found {len(nodes)} nodes:")
        for node_id, node_data in nodes.items():
            print(f"   - {node_id}: {node_data.get('type')}")

        # Get all edges
        print("\n5. Getting all edges...")
        edges = client.get_all_edges()
        print(f"✅ Found {len(edges)} edges:")
        for edge_id, edge_data in edges.items():
            print(f"   - {edge_id}: {edge_data.get('source')} → {edge_data.get('target')}")

        # Wait a bit to see if updates propagate
        print("\n6. Waiting for updates to propagate...")
        await asyncio.sleep(2)
        print("✅ Done!")

        print("\n" + "=" * 50)
        print("✅ All tests passed!")
        print("\n💡 Tip: Open your frontend to see if the node appears!")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

    finally:
        # Disconnect
        print("\n7. Disconnecting...")
        await client.disconnect()
        print("✅ Disconnected!")


if __name__ == "__main__":
    asyncio.run(test_loro_sync())
