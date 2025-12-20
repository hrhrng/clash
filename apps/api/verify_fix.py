
import logging
from master_clash.tools.loro_sync_client import LoroSyncClient
from loro import LoroDoc

# Setup logging
logging.basicConfig(level=logging.INFO)

# Mock client to use local doc
class MockClient(LoroSyncClient):
    def __init__(self):
        self.doc = LoroDoc()
        self.connected = True
        self.ws = True # Fake
        
    def _send_update(self, update):
        print(f"Mock send update: {len(update)} bytes")

client = MockClient()
nodes = client.doc.get_map("nodes")
nodes.insert("test-node", {"id": "test-node", "data": {"status": "init"}})

print("--- Setup Complete ---")

# get proxy
proxy = nodes.get("test-node")
print(f"Proxy type: {type(proxy)}")

print("--- Testing update_node with Proxy ---")
try:
    # This simulates passing a proxy to update_node (which might happen if we didn't clean it)
    # But wait, update_node implementation does: {**existing, **node_data}
    # verify existing handling
    client.update_node("test-node", {"data": {"status": "updated"}})
    print("update_node passed")
except Exception as e:
    print(f"update_node FAILED: {e}")
    import traceback
    traceback.print_exc()

print("--- Testing batch_set_nodes with Proxy ---")
try:
    # Pass proxy as value
    client.batch_set_nodes({"test-node": proxy})
    print("batch_set_nodes passed")
except Exception as e:
    print(f"batch_set_nodes FAILED: {e}")
    import traceback
    traceback.print_exc()
