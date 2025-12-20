
import sys
from loro import LoroDoc, LoroMap
import json

doc = LoroDoc()
nodes = doc.get_map("nodes")

# Create nested structure
# Note: Loro insert usually handles dicts by converting them to Loro structures recursively
nodes.insert("nested-node", {
    "type": "test",
    "data": {
        "params": {
            "prompt": "foo",
            "cfg": 7.0
        },
        "list": [1, 2, {"a": "b"}]
    }
})

print("--- Testing Recursive .value ---")
proxy_node = nodes.get("nested-node")
val = proxy_node.value
print(f"Node .value type: {type(val)}")
print(f"Node .value: {val}")

data = val.get("data")
print(f"Data type: {type(data)}")

params = data.get("params")
print(f"Params type: {type(params)}")

print("Is fully recursive dict?", isinstance(params, dict))

# Test 'not a mapping' triggers
try:
    print("Testing dict(proxy)...")
    d = dict(proxy_node)
    print("dict(proxy) worked")
except Exception as e:
    print(f"dict(proxy) failed: {e}")

try:
    print("Testing **proxy...")
    def foo(**kwargs): pass
    foo(**proxy_node)
    print("**proxy worked")
except Exception as e:
    print(f"**proxy failed: {e}")

try:
    print("Testing proxy['key']...")
    _ = proxy_node['type']
except Exception as e:
    print(f"proxy['key'] failed: {e}")
