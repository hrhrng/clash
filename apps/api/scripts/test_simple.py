"""Simple test without full dependencies."""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


def test_imports():
    """Test that all modules can be imported."""
    print("🧪 Testing imports...")

    try:
        print("  ✓ Importing backends...")
        from master_clash.workflow.backends import (
            CanvasBackendProtocol,
            StateCanvasBackend,
            CreateNodeResult,
            NodeInfo,
        )

        print("  ✓ Importing middleware...")
        from master_clash.workflow.middleware import (
            AgentMiddleware,
            CanvasMiddleware,
            TodoListMiddleware,
            AgentState,
        )

        print("  ✓ Importing subagents...")
        from master_clash.workflow.subagents import (
            SubAgent,
            SubAgentMiddleware,
        )

        print("  ✓ Importing graph...")
        from master_clash.workflow.graph import (
            create_agent_with_middleware,
            create_supervisor_agent,
        )

        print("\n✅ All imports successful!")
        return True

    except Exception as e:
        print(f"\n❌ Import failed: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_dataclasses():
    """Test dataclass structures."""
    print("\n🧪 Testing dataclass structures...")

    try:
        from master_clash.workflow.backends import CreateNodeResult, NodeInfo

        # Test CreateNodeResult
        result = CreateNodeResult(
            node_id="test-node",
            error=None,
            proposal={"type": "simple", "nodeData": {}},
        )
        print(f"  ✓ CreateNodeResult: {result.node_id}")
        print(f"    - Has proposal: {result.proposal is not None}")

        # Test NodeInfo
        node = NodeInfo(
            id="node-1",
            type="text",
            position={"x": 100, "y": 200},
            data={"label": "Test"},
            parent_id=None,
        )
        print(f"  ✓ NodeInfo: {node.id} ({node.type})")

        print("\n✅ Dataclass tests passed!")
        return True

    except Exception as e:
        print(f"\n❌ Dataclass test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_subagent_properties():
    """Test SubAgent properties."""
    print("\n🧪 Testing SubAgent properties...")

    try:
        from master_clash.workflow.subagents import SubAgent

        # Create workspace-aware agent
        workspace_agent = SubAgent(
            name="TestAgent",
            description="Test agent",
            system_prompt="Test",
            tools=[],
            workspace_aware=True,
        )

        # Create non-workspace-aware agent
        global_agent = SubAgent(
            name="GlobalAgent",
            description="Global agent",
            system_prompt="Test",
            tools=[],
            workspace_aware=False,
        )

        print(f"  ✓ TestAgent workspace_aware: {workspace_agent.workspace_aware}")
        print(f"  ✓ GlobalAgent workspace_aware: {global_agent.workspace_aware}")

        assert workspace_agent.workspace_aware is True
        assert global_agent.workspace_aware is False

        print("\n✅ SubAgent property tests passed!")
        return True

    except Exception as e:
        print(f"\n❌ SubAgent test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_agent_state_schema():
    """Test AgentState schema."""
    print("\n🧪 Testing AgentState schema...")

    try:
        from master_clash.workflow.middleware import AgentState

        # Check annotations
        annotations = AgentState.__annotations__
        print(f"  ✓ AgentState has {len(annotations)} fields:")
        for key, value in annotations.items():
            print(f"    - {key}: {value}")

        assert "messages" in annotations
        assert "project_id" in annotations
        assert "workspace_group_id" in annotations

        print("\n✅ AgentState schema tests passed!")
        return True

    except Exception as e:
        print(f"\n❌ AgentState test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


def test_mock_backend_operations():
    """Test backend operations with minimal dependencies."""
    print("\n🧪 Testing mock backend operations...")

    try:
        from master_clash.workflow.backends import StateCanvasBackend, CreateNodeResult

        backend = StateCanvasBackend()
        print("  ✓ Created StateCanvasBackend instance")

        # Test methods exist
        assert hasattr(backend, "list_nodes")
        assert hasattr(backend, "read_node")
        assert hasattr(backend, "create_node")
        assert hasattr(backend, "wait_for_task")
        assert hasattr(backend, "search_nodes")
        print("  ✓ Backend has all required methods")

        print("\n✅ Mock backend tests passed!")
        return True

    except Exception as e:
        print(f"\n❌ Backend test failed: {e}")
        import traceback

        traceback.print_exc()
        return False


def main():
    """Run all simple tests."""
    print("=" * 70)
    print("🧪 Master Clash Architecture Simple Test")
    print("=" * 70)

    results = []

    results.append(("Imports", test_imports()))
    results.append(("Dataclasses", test_dataclasses()))
    results.append(("SubAgent Properties", test_subagent_properties()))
    results.append(("AgentState Schema", test_agent_state_schema()))
    results.append(("Backend Operations", test_mock_backend_operations()))

    print("\n" + "=" * 70)
    print("📊 Test Results:")
    print("=" * 70)

    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {name}")

    all_passed = all(result[1] for result in results)

    print("=" * 70)
    if all_passed:
        print("✅ All tests passed!")
    else:
        print("❌ Some tests failed")
    print("=" * 70)

    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
