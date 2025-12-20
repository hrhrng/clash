#!/usr/bin/env python3
"""Test Agent Loro integration by simulating an agent request."""

import asyncio
import httpx
import json

async def test_agent_loro_integration():
    """Test that Agent creates nodes and they sync to Loro."""

    project_id = "test_project_loro"
    api_base = "http://localhost:8000"

    print("=" * 80)
    print("Testing Agent Loro Integration")
    print("=" * 80)

    # Test 1: Create a node via Agent
    print("\n[Test 1] Creating a node via Agent...")
    print("-" * 80)

    request_payload = {
        "project_id": project_id,
        "message": "创建一个图片生成节点，用于生成一只猫的图片",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # Stream the response
            async with client.stream(
                "POST",
                f"{api_base}/api/chat/stream",
                json=request_payload,
            ) as response:
                if response.status_code != 200:
                    print(f"❌ Error: Status {response.status_code}")
                    print(await response.aread())
                    return

                print("✅ Connected to streaming endpoint")
                print("\nAgent response:")
                print("-" * 80)

                node_created = False
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue

                    data_str = line[6:]  # Remove "data: " prefix
                    if data_str == "[DONE]":
                        break

                    try:
                        data = json.loads(data_str)
                        event_type = data.get("event")

                        if event_type == "agent":
                            content = data.get("data", {}).get("content", "")
                            if content:
                                print(content, end="", flush=True)

                        elif event_type == "action":
                            action_data = data.get("data", {})
                            action = action_data.get("action")
                            if action == "create_node":
                                node_id = action_data.get("node_id")
                                node_type = action_data.get("node_type")
                                print(f"\n\n✅ Node created: {node_id} (type: {node_type})")
                                node_created = True

                    except json.JSONDecodeError:
                        continue

                print("\n" + "-" * 80)

                if node_created:
                    print("✅ Test 1 PASSED: Node created successfully")
                else:
                    print("❌ Test 1 FAILED: No node created")

        except Exception as e:
            print(f"❌ Error during test: {e}")
            import traceback
            traceback.print_exc()

    # Test 2: List nodes via Agent
    print("\n[Test 2] Listing nodes via Agent...")
    print("-" * 80)

    list_payload = {
        "project_id": project_id,
        "message": "列出所有节点",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            async with client.stream(
                "POST",
                f"{api_base}/api/chat/stream",
                json=list_payload,
            ) as response:
                if response.status_code != 200:
                    print(f"❌ Error: Status {response.status_code}")
                    return

                print("✅ Connected to streaming endpoint")
                print("\nAgent response:")
                print("-" * 80)

                nodes_listed = False
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue

                    data_str = line[6:]
                    if data_str == "[DONE]":
                        break

                    try:
                        data = json.loads(data_str)
                        event_type = data.get("event")

                        if event_type == "agent":
                            content = data.get("data", {}).get("content", "")
                            if content:
                                print(content, end="", flush=True)
                                if "node" in content.lower():
                                    nodes_listed = True

                    except json.JSONDecodeError:
                        continue

                print("\n" + "-" * 80)

                if nodes_listed:
                    print("✅ Test 2 PASSED: Nodes listed successfully")
                else:
                    print("⚠️  Test 2: Check agent output above")

        except Exception as e:
            print(f"❌ Error during test: {e}")

    print("\n" + "=" * 80)
    print("Test completed!")
    print("=" * 80)
    print("\n⚠️  IMPORTANT: Check the following logs:")
    print("1. Agent API logs for '[LoroSync]' messages")
    print("2. Loro Sync Server logs for connection and updates")
    print("3. Frontend browser console for received updates")
    print("\nIf everything works correctly, you should see:")
    print("- Agent: '[LoroSync] Connected for project...'")
    print("- Agent: '[LoroSync] Added node ... to Loro'")
    print("- Sync Server: '[LoroRoom] Received update from client'")
    print("- Frontend: '[useLoroSync] Received update from server'")
    print("- Frontend: Node appears on canvas")

if __name__ == "__main__":
    asyncio.run(test_agent_loro_integration())
