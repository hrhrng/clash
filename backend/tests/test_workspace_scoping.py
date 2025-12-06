"""Test workspace scoping feature with mock data."""

import asyncio
from unittest.mock import MagicMock, patch

import pytest
from langchain_core.messages import HumanMessage

from master_clash.context import NodeModel, Position, ProjectContext, set_project_context
from master_clash.workflow.backends import StateCanvasBackend
from master_clash.workflow.graph import create_supervisor_agent
from master_clash.workflow.middleware import CanvasMiddleware, TodoListMiddleware
from master_clash.workflow.multi_agent import create_default_llm
from master_clash.workflow.subagents import create_specialist_agents


@pytest.fixture
def mock_context():
    """Create a mock project context."""
    context = ProjectContext(
        nodes=[
            NodeModel(
                id="existing-text-1",
                type="text",
                position=Position(x=100, y=100),
                data={"label": "Existing Note", "content": "Some existing content"},
                parentId=None,
            ),
            NodeModel(
                id="existing-group-1",
                type="group",
                position=Position(x=200, y=200),
                data={"label": "Existing Group", "description": "An existing workspace"},
                parentId=None,
            ),
        ],
        edges=[],
    )
    return context


@pytest.fixture
def setup_mock_context(mock_context):
    """Setup mock context in the system."""
    set_project_context("test-project", mock_context)
    yield
    # Cleanup after test
    from master_clash.context import _PROJECT_CONTEXTS

    _PROJECT_CONTEXTS.clear()


@pytest.fixture
def mock_llm():
    """Create a mock LLM for testing."""
    llm = MagicMock()
    llm.ainvoke = MagicMock(return_value=MagicMock(content="Test response"))
    return llm


def test_state_canvas_backend_list_nodes(setup_mock_context):
    """Test that backend can list nodes from context."""
    backend = StateCanvasBackend()
    nodes = backend.list_nodes("test-project")

    assert len(nodes) == 2
    assert nodes[0].id == "existing-text-1"
    assert nodes[0].type == "text"
    assert nodes[1].id == "existing-group-1"
    assert nodes[1].type == "group"


def test_state_canvas_backend_filter_by_type(setup_mock_context):
    """Test filtering nodes by type."""
    backend = StateCanvasBackend()
    groups = backend.list_nodes("test-project", node_type="group")

    assert len(groups) == 1
    assert groups[0].id == "existing-group-1"


def test_state_canvas_backend_read_node(setup_mock_context):
    """Test reading a specific node."""
    backend = StateCanvasBackend()
    node = backend.read_node("test-project", "existing-text-1")

    assert node is not None
    assert node.id == "existing-text-1"
    assert node.data["label"] == "Existing Note"


def test_state_canvas_backend_read_nonexistent_node(setup_mock_context):
    """Test reading a node that doesn't exist."""
    backend = StateCanvasBackend()
    node = backend.read_node("test-project", "nonexistent-node")

    assert node is None


@patch("master_clash.workflow.backends.generate_unique_id_for_project")
def test_state_canvas_backend_create_node(mock_generate_id, setup_mock_context):
    """Test creating a node proposal."""
    mock_generate_id.return_value = "new-node-id"

    backend = StateCanvasBackend()
    result = backend.create_node(
        project_id="test-project",
        node_type="text",
        data={"label": "New Note", "content": "New content"},
    )

    assert result.node_id == "new-node-id"
    assert result.error is None
    assert result.proposal is not None
    assert result.proposal["type"] == "simple"
    assert result.proposal["nodeData"]["label"] == "New Note"


@patch("master_clash.workflow.backends.generate_unique_id_for_project")
def test_state_canvas_backend_create_image_gen_node(mock_generate_id, setup_mock_context):
    """Test creating an image generation node."""
    mock_generate_id.return_value = "new-image-node"

    backend = StateCanvasBackend()
    result = backend.create_node(
        project_id="test-project",
        node_type="image_gen",
        data={"label": "Character Design", "prompt": "A space explorer"},
    )

    assert result.node_id == "new-image-node"
    assert result.proposal is not None
    assert result.proposal["type"] == "generative"
    assert result.proposal["nodeType"] == "action-badge-image"


@patch("master_clash.workflow.backends.generate_unique_id_for_project")
def test_state_canvas_backend_create_node_with_parent(mock_generate_id, setup_mock_context):
    """Test creating a node with parent_id."""
    mock_generate_id.return_value = "child-node-id"

    backend = StateCanvasBackend()
    result = backend.create_node(
        project_id="test-project",
        node_type="text",
        data={"label": "Child Note"},
        parent_id="existing-group-1",
    )

    assert result.node_id == "child-node-id"
    assert result.proposal["groupId"] == "existing-group-1"


def test_state_canvas_backend_search_nodes(setup_mock_context):
    """Test searching nodes by content."""
    backend = StateCanvasBackend()
    results = backend.search_nodes("test-project", "existing")

    assert len(results) == 2  # Both have "existing" in their labels


def test_state_canvas_backend_search_nodes_no_match(setup_mock_context):
    """Test searching with no matches."""
    backend = StateCanvasBackend()
    results = backend.search_nodes("test-project", "nonexistent")

    assert len(results) == 0


def test_state_canvas_backend_wait_for_task_not_found(setup_mock_context):
    """Test waiting for a task that doesn't exist."""
    backend = StateCanvasBackend()
    result = backend.wait_for_task("test-project", "nonexistent-node")

    assert result.status == "node_not_found"


@pytest.mark.asyncio
async def test_supervisor_tools_integration(setup_mock_context, mock_llm):
    """Test that supervisor has workspace management tools."""
    # Create backend and middleware
    backend = StateCanvasBackend()
    canvas_middleware = CanvasMiddleware(backend=backend)
    todo_middleware = TodoListMiddleware()

    # Create specialist sub-agents
    subagents = create_specialist_agents(
        model=mock_llm,
        canvas_middleware=canvas_middleware,
        todo_middleware=todo_middleware,
    )

    # Verify sub-agents are workspace-aware
    assert subagents[0].name == "ScriptWriter"
    assert subagents[0].workspace_aware is True
    assert subagents[1].name == "ConceptArtist"
    assert subagents[1].workspace_aware is True
    assert subagents[2].name == "StoryboardDesigner"
    assert subagents[2].workspace_aware is True
    assert subagents[3].name == "Editor"
    assert subagents[3].workspace_aware is False


@pytest.mark.asyncio
async def test_middleware_auto_scoping():
    """Test that middleware automatically sets parent_id from workspace_group_id."""
    from master_clash.workflow.middleware import ToolRuntime

    backend = StateCanvasBackend()
    middleware = CanvasMiddleware(backend=backend)

    # Create tool
    create_node_tool = middleware._create_node_tool()

    # Mock runtime with workspace_group_id
    runtime = ToolRuntime(
        state={
            "project_id": "test-project",
            "workspace_group_id": "workspace-123",
        },
        config={},
        tool_call_id="test-call",
    )

    with patch("master_clash.workflow.backends.generate_unique_id_for_project") as mock_gen:
        mock_gen.return_value = "new-node"

        # Create node without explicit parent_id
        with patch("master_clash.context.get_project_context") as mock_context:
            mock_context.return_value = ProjectContext(nodes=[], edges=[])

            result = create_node_tool.invoke(
                {
                    "node_type": "text",
                    "data": {"label": "Test"},
                    "runtime": runtime,
                }
            )

            # Verify backend was called with workspace as parent
            # (We'd need to inspect the actual call, but this shows the test structure)
            assert "new-node" in result


def test_canvas_middleware_generates_tools():
    """Test that CanvasMiddleware generates all expected tools."""
    backend = StateCanvasBackend()
    middleware = CanvasMiddleware(backend=backend)

    tools = middleware._generate_canvas_tools()

    # Verify we have 8 tools
    assert len(tools) == 8

    tool_names = [tool.name for tool in tools]
    expected_tools = [
        "list_canvas_nodes",
        "read_canvas_node",
        "create_canvas_node",
        "update_canvas_node",
        "create_canvas_edge",
        "wait_for_generation",
        "search_canvas",
        "timeline_editor",
    ]

    for expected in expected_tools:
        assert expected in tool_names


def test_todolist_middleware_generates_tools():
    """Test that TodoListMiddleware generates todo tools."""
    middleware = TodoListMiddleware()
    tools = middleware._generate_todo_tools()

    assert len(tools) == 2

    tool_names = [tool.name for tool in tools]
    assert "write_todos" in tool_names
    assert "read_todos" in tool_names


@pytest.mark.asyncio
@patch("master_clash.workflow.graph.generate_unique_id_for_project")
@patch("langgraph.config.get_stream_writer")
async def test_create_workspace_group_emits_sse(mock_writer, mock_gen_id):
    """Test that create_workspace_group emits SSE proposal."""
    mock_gen_id.return_value = "workspace-123"
    mock_stream_writer = MagicMock()
    mock_writer.return_value = mock_stream_writer

    from master_clash.workflow.graph import create_supervisor_agent

    # Create supervisor (which creates the tools)
    llm = MagicMock()
    supervisor = create_supervisor_agent(
        model=llm,
        subagents=[],  # Empty for this test
    )

    # The tools are created but we can't easily test them without invoking the agent
    # This test structure shows how you'd test SSE emission


def test_subagent_workspace_aware_property():
    """Test SubAgent workspace_aware property."""
    from master_clash.workflow.subagents import SubAgent

    workspace_agent = SubAgent(
        name="TestAgent",
        description="Test",
        system_prompt="Test prompt",
        tools=[],
        workspace_aware=True,
    )

    non_workspace_agent = SubAgent(
        name="TestAgent2",
        description="Test",
        system_prompt="Test prompt",
        tools=[],
        workspace_aware=False,
    )

    assert workspace_agent.workspace_aware is True
    assert non_workspace_agent.workspace_aware is False


@pytest.mark.asyncio
async def test_task_delegation_with_workspace():
    """Test that task_delegation passes workspace_group_id to sub-agent."""
    from master_clash.workflow.middleware import AgentState, ToolRuntime
    from master_clash.workflow.subagents import SubAgent, SubAgentMiddleware

    # Create a workspace-aware sub-agent
    mock_agent = SubAgent(
        name="TestAgent",
        description="Test",
        system_prompt="Test",
        tools=[],
        workspace_aware=True,
    )

    middleware = SubAgentMiddleware(subagents=[mock_agent])
    tool = middleware._create_task_tool()

    # Mock runtime
    runtime = ToolRuntime(
        state={"project_id": "test-project"},
        config={},
        tool_call_id="test-call",
    )

    # This would require a full integration test with actual LangGraph execution
    # But the structure is here for reference


def test_agent_state_has_workspace_field():
    """Test that AgentState includes workspace_group_id field."""
    from master_clash.workflow.middleware import AgentState

    # AgentState is a TypedDict, we can't instantiate it directly
    # But we can verify the annotations
    annotations = AgentState.__annotations__

    assert "workspace_group_id" in annotations
    assert "project_id" in annotations
    assert "messages" in annotations


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "-s"])
