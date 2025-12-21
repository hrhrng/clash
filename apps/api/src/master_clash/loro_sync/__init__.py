"""
Loro CRDT Sync Client Package

This package provides a client for connecting to the Loro sync server
and manipulating the canvas state (nodes, edges, tasks) in real-time.

Usage:
    from master_clash.loro_sync import LoroSyncClient

    client = LoroSyncClient(project_id="proj_123", sync_server_url="ws://localhost:8787")
    await client.connect()
    client.add_node("node_123", {...})
    await client.disconnect()
"""

from master_clash.loro_sync.client import LoroSyncClient, LoroSyncClientSync

__all__ = ["LoroSyncClient", "LoroSyncClientSync"]
