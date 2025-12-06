"""Manual test script for workspace scoping feature.

Run this to test the new architecture with mock data.
"""

import asyncio
from master_clash.context import NodeModel, Position, ProjectContext, set_project_context
from master_clash.workflow.backends import StateCanvasBackend
from master_clash.workflow.middleware import CanvasMiddleware, TodoListMiddleware


def setup_mock_context():
    """Setup mock project context."""
    print("📦 Setting up mock project context...")

    context = ProjectContext(
        nodes=[
            NodeModel(
                id="story-outline-1",
                type="text",
                position=Position(x=100, y=100),
                data={
                    "label": "Story Outline",
                    "content": "A space explorer discovers an alien planet...",
                },
                parentId=None,
            ),
            NodeModel(
                id="character-bio-1",
                type="text",
                position=Position(x=100, y=200),
                data={
                    "label": "Character: Explorer",
                    "content": "Captain Sarah Chen, experienced astronaut...",
                },
                parentId=None,
            ),
            NodeModel(
                id="design-workspace-1",
                type="group",
                position=Position(x=300, y=100),
                data={
                    "label": "Visual Design Workspace",
                    "description": "Character and scene designs",
                },
                parentId=None,
            ),
            NodeModel(
                id="char-prompt-1",
                type="prompt",
                position=Position(x=320, y=120),
                data={
                    "label": "Character Design Prompt",
                    "content": "Futuristic space suit with helmet...",
                },
                parentId="design-workspace-1",
            ),
        ],
        edges=[],
    )

    set_project_context("test-project", context)
    print("✅ Mock context setup complete")
    print(f"   - {len(context.nodes)} nodes created")
    print(f"   - 1 group (workspace) created")


def test_backend_operations():
    """Test backend operations."""
    print("\n🧪 Testing Backend Operations...")

    backend = StateCanvasBackend()

    # Test 1: List all nodes
    print("\n1️⃣ List all nodes:")
    nodes = backend.list_nodes("test-project")
    for node in nodes:
        print(f"   - {node.id} ({node.type}): {node.data.get('label', 'N/A')}")

    # Test 2: List only groups
    print("\n2️⃣ List only groups:")
    groups = backend.list_nodes("test-project", node_type="group")
    for group in groups:
        print(f"   - {group.id}: {group.data.get('label', 'N/A')}")

    # Test 3: List nodes in a group
    print("\n3️⃣ List nodes in design workspace:")
    workspace_nodes = backend.list_nodes("test-project", parent_id="design-workspace-1")
    for node in workspace_nodes:
        print(f"   - {node.id} ({node.type}): {node.data.get('label', 'N/A')}")

    # Test 4: Read a specific node
    print("\n4️⃣ Read specific node:")
    node = backend.read_node("test-project", "story-outline-1")
    if node:
        print(f"   - ID: {node.id}")
        print(f"   - Type: {node.type}")
        print(f"   - Label: {node.data.get('label', 'N/A')}")
        print(f"   - Content: {node.data.get('content', 'N/A')[:50]}...")

    # Test 5: Create node proposal
    print("\n5️⃣ Create node proposal:")
    result = backend.create_node(
        project_id="test-project",
        node_type="text",
        data={"label": "Test Note", "content": "This is a test"},
    )
    print(f"   - Node ID: {result.node_id}")
    print(f"   - Error: {result.error}")
    print(f"   - Proposal type: {result.proposal.get('type') if result.proposal else 'N/A'}")

    # Test 6: Create node with parent (workspace scoping)
    print("\n6️⃣ Create node with parent (workspace scoping):")
    result = backend.create_node(
        project_id="test-project",
        node_type="prompt",
        data={"label": "Scene Design", "content": "Alien landscape..."},
        parent_id="design-workspace-1",
    )
    print(f"   - Node ID: {result.node_id}")
    print(f"   - Group ID: {result.proposal.get('groupId') if result.proposal else 'N/A'}")

    # Test 7: Search nodes
    print("\n7️⃣ Search nodes:")
    results = backend.search_nodes("test-project", "design")
    for node in results:
        print(f"   - {node.id}: {node.data.get('label', 'N/A')}")

    # Test 8: Wait for task (mock)
    print("\n8️⃣ Wait for task status:")
    task_result = backend.wait_for_task("test-project", "char-prompt-1")
    print(f"   - Status: {task_result.status}")


def test_middleware_tools():
    """Test middleware tool generation."""
    print("\n🔧 Testing Middleware Tools...")

    backend = StateCanvasBackend()
    canvas_middleware = CanvasMiddleware(backend=backend)
    todo_middleware = TodoListMiddleware()

    # Test Canvas Middleware
    print("\n1️⃣ Canvas Middleware tools:")
    canvas_tools = canvas_middleware._generate_canvas_tools()
    for tool in canvas_tools:
        print(f"   - {tool.name}: {tool.description[:60]}...")

    # Test TodoList Middleware
    print("\n2️⃣ TodoList Middleware tools:")
    todo_tools = todo_middleware._generate_todo_tools()
    for tool in todo_tools:
        print(f"   - {tool.name}: {tool.description[:60]}...")


def test_subagent_configuration():
    """Test sub-agent configuration."""
    print("\n🤖 Testing SubAgent Configuration...")

    from master_clash.workflow.multi_agent import create_default_llm
    from master_clash.workflow.subagents import create_specialist_agents

    llm = create_default_llm()
    backend = StateCanvasBackend()
    canvas_middleware = CanvasMiddleware(backend=backend)
    todo_middleware = TodoListMiddleware()

    subagents = create_specialist_agents(
        model=llm,
        canvas_middleware=canvas_middleware,
        todo_middleware=todo_middleware,
    )

    print(f"\n✅ Created {len(subagents)} specialist agents:")
    for agent in subagents:
        workspace_status = "✅ workspace-aware" if agent.workspace_aware else "❌ global"
        print(f"   - {agent.name}: {workspace_status}")
        print(f"     Description: {agent.description}")
        print(f"     Tools: {len(agent.tools)} tools")


def test_workspace_scoping_scenario():
    """Test a complete workspace scoping scenario."""
    print("\n🎬 Testing Complete Workspace Scenario...")
    print("\nScenario: Create a character design workspace and add nodes")

    backend = StateCanvasBackend()

    # Step 1: Create workspace group
    print("\n1️⃣ Create workspace group:")
    workspace_result = backend.create_node(
        project_id="test-project",
        node_type="group",
        data={
            "label": "Character Design",
            "description": "Workspace for character designs",
        },
    )
    workspace_id = workspace_result.node_id
    print(f"   ✅ Created workspace: {workspace_id}")

    # Step 2: Create prompt node in workspace
    print("\n2️⃣ Create prompt node in workspace:")
    prompt_result = backend.create_node(
        project_id="test-project",
        node_type="prompt",
        data={"label": "Space Explorer Design", "content": "Futuristic astronaut..."},
        parent_id=workspace_id,
    )
    print(f"   ✅ Created prompt: {prompt_result.node_id}")
    print(f"   ✅ Parent: {prompt_result.proposal.get('groupId')}")

    # Step 3: Create image gen node in workspace
    print("\n3️⃣ Create image generation node in workspace:")
    image_result = backend.create_node(
        project_id="test-project",
        node_type="image_gen",
        data={"label": "Character Render", "prompt": "Generate character image"},
        parent_id=workspace_id,
    )
    print(f"   ✅ Created image gen: {image_result.node_id}")
    print(f"   ✅ Parent: {image_result.proposal.get('groupId')}")
    print(f"   ✅ Node type: {image_result.proposal.get('nodeType')}")

    # Step 4: Verify workspace organization
    print("\n4️⃣ Verify workspace organization:")
    workspace_nodes = backend.list_nodes("test-project", parent_id=workspace_id)
    print(f"   ✅ Workspace has {len(workspace_nodes)} child nodes")
    for node in workspace_nodes:
        print(f"      - {node.id} ({node.type}): {node.data.get('label')}")


def main():
    """Run all tests."""
    print("=" * 70)
    print("🧪 Master Clash Workspace Scoping Manual Test")
    print("=" * 70)

    try:
        # Setup
        setup_mock_context()

        # Run tests
        test_backend_operations()
        test_middleware_tools()
        test_subagent_configuration()
        test_workspace_scoping_scenario()

        print("\n" + "=" * 70)
        print("✅ All manual tests completed successfully!")
        print("=" * 70)

    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    main()
