"""
Loro CRDT Sync Client Package

This package provides a client for connecting to the Loro sync server
and manipulating the canvas state (nodes, edges, tasks) in real-time.

Usage:
    from master_clash.loro_sync import LoroSyncClient, NEEDS_LAYOUT_POSITION

    client = LoroSyncClient(project_id="proj_123", sync_server_url="ws://localhost:8787")
    await client.connect()

    # Add node with auto-layout (frontend calculates position)
    client.add_node_auto_layout("node_123", "action-badge", {"label": "My Node"})

    # Or manually with explicit position
    client.add_node("node_456", {
        "type": "image",
        "position": {"x": 100, "y": 200},
        "data": {"url": "..."}
    })

    await client.disconnect()
"""

from master_clash.loro_sync.client import LoroSyncClient, LoroSyncClientSync
from master_clash.loro_sync.nodes import NEEDS_LAYOUT_POSITION

__all__ = ["LoroSyncClient", "LoroSyncClientSync", "NEEDS_LAYOUT_POSITION"]
