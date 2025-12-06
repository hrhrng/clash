"""Middleware system for agent lifecycle hooks.

Inspired by deepagents' middleware architecture, each middleware can:
- Wrap model calls (add system prompts, filter tools)
- Wrap tool calls (process results, validate inputs)
- Define state schema
- Hook into agent lifecycle
"""

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Annotated, Any, Callable, Literal, Sequence, TypedDict, TypeVar

from pydantic import BaseModel, Field
from langchain_core.messages import BaseMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool, InjectedToolCallId
from langgraph.graph import add_messages
from langgraph.prebuilt import InjectedState

from master_clash.workflow.backends import (
    CanvasBackendProtocol,
    CreateNodeResult,
    NodeInfo,
    StateCanvasBackend,
    TaskStatusResult,
    TimelineOperation,
    TimelineResult,
    UpdateNodeResult,
)

# Type aliases
T = TypeVar("T")
BackendFactory = Callable[["ToolRuntime"], CanvasBackendProtocol]


class AgentState(TypedDict):
    """Base agent state schema."""

    messages: Annotated[list[BaseMessage], add_messages]
    project_id: str
    workspace_group_id: str | None  # Optional workspace scope for sub-agents


@dataclass
class ModelRequest:
    """Request to the language model."""

    messages: list[BaseMessage]
    tools: list[BaseTool]
    system_prompt: str | None = None


@dataclass
class ModelResponse:
    """Response from the language model."""

    message: BaseMessage
    tool_calls: list[dict[str, Any]] | None = None


@dataclass
class ToolCallRequest:
    """Request to execute a tool."""

    tool_name: str
    tool_input: dict[str, Any]
    tool_call_id: str


@dataclass
class ToolRuntime:
    """Runtime context passed to tools.

    Provides access to agent state, configuration, and utilities.
    """

    state: dict[str, Any]
    config: dict[str, Any]
    tool_call_id: str


class AgentMiddleware(ABC):
    """Base middleware for agent lifecycle hooks.

    Middlewares are stacked and executed in order:
    1. wrap_model_call - Before LLM inference
    2. wrap_tool_call - Before tool execution
    3. before_agent - Before agent step
    """

    state_schema: type[AgentState] | None = None

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Wrap model call with custom logic.

        Args:
            request: Model request with messages, tools, system prompt
            handler: Next handler in the chain

        Returns:
            Model response
        """
        return handler(request)

    def wrap_tool_call(
        self,
        request: ToolCallRequest,
        handler: Callable[[ToolCallRequest], ToolMessage],
    ) -> ToolMessage:
        """Wrap tool call with custom logic.

        Args:
            request: Tool call request
            handler: Next handler in the chain

        Returns:
            Tool message result
        """
        return handler(request)

    def before_agent(
        self,
        state: AgentState,
        runtime: ToolRuntime,
    ) -> dict[str, Any] | None:
        """Hook before agent step.

        Args:
            state: Current agent state
            runtime: Tool runtime context

        Returns:
            Optional state updates
        """
        return None


class CanvasState(AgentState):
    """Extended state with canvas data."""

    canvas_nodes: dict[str, NodeInfo]  # node_id -> NodeInfo
    canvas_edges: dict[str, dict[str, Any]]  # edge_id -> edge data


def _canvas_reducer(
    left: dict[str, NodeInfo] | None,
    right: dict[str, NodeInfo],
) -> dict[str, NodeInfo]:
    """Merge canvas nodes, support deletion by setting value=None."""
    if left is None:
        return {k: v for k, v in right.items() if v is not None}
    result = {**left}
    for key, value in right.items():
        if value is None:
            result.pop(key, None)
        else:
            result[key] = value
    return result


class TimelineMiddleware(AgentMiddleware):
    """Middleware that provides timeline editing tools."""

    state_schema = AgentState

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Add timeline tools to the model request."""
        timeline_tools = self._generate_timeline_tools()

        request.tools = [*request.tools, *timeline_tools]

        timeline_prompt = """
You can control the video timeline via the timeline_editor tool.
- timeline_editor: Provide an action (e.g., add_clip, set_duration, render) and params.
"""
        if request.system_prompt:
            request.system_prompt = f"{request.system_prompt}\n\n{timeline_prompt}"
        else:
            request.system_prompt = timeline_prompt

        return handler(request)

    def _generate_timeline_tools(self) -> list[BaseTool]:
        """Generate timeline tools."""
        return [self._timeline_editor_tool()]

    def _timeline_editor_tool(self) -> BaseTool:
        """Create timeline_editor tool."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        class TimelineEditorInput(BaseModel):
            action: str = Field(description="Timeline action, e.g. add_clip, set_duration, render")
            params: dict[str, Any] = Field(description="Action parameters")

        @tool(args_schema=TimelineEditorInput)
        def timeline_editor(
            action: str,
            params: dict[str, Any],
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Automated video editor tool."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")

            try:
                # Emit SSE event for timeline editing
                writer = get_stream_writer()
                if writer:
                    writer({
                        "action": "timeline_edit",
                        "edit_action": action,
                        "params": params,
                        "project_id": project_id,
                    })

                return f"Timeline action '{action}' executed successfully"

            except Exception as e:
                return f"Error in timeline editor: {e}"

        return timeline_editor


class CanvasMiddleware(AgentMiddleware):
    """Middleware that provides canvas tools.

    Similar to FilesystemMiddleware in deepagents, but for canvas operations.
    """

    state_schema = CanvasState

    def __init__(
        self,
        backend: CanvasBackendProtocol | BackendFactory | None = None,
    ):
        """Initialize canvas middleware.

        Args:
            backend: Canvas backend or factory function
        """
        self.backend = backend or StateCanvasBackend()

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Add canvas tools to the model request."""
        # Generate canvas tools
        canvas_tools = self._generate_canvas_tools()

        # Merge with existing tools
        request.tools = [*request.tools, *canvas_tools]

        # Add canvas-specific system prompt
        canvas_prompt = """
You have access to canvas tools for creating and managing visual content:
- list_canvas_nodes: List nodes on the canvas
- read_canvas_node: Read a specific node's data
- create_canvas_node: Create text/prompt/group nodes
- create_generation_node: Create image/video generation nodes
- wait_for_generation: Wait for image/video generation to complete
- search_canvas: Search nodes by content

IMPORTANT: For generation nodes (image_gen, video_gen), you MUST:
1. Use create_generation_node
2. Call wait_for_generation to check status
3. Only proceed when status is 'completed'
"""
        if request.system_prompt:
            request.system_prompt = f"{request.system_prompt}\n\n{canvas_prompt}"
        else:
            request.system_prompt = canvas_prompt

        return handler(request)

    def _generate_canvas_tools(self) -> list[BaseTool]:
        """Generate canvas tools based on backend capabilities."""
        # Tool factories (will be implemented below)
        return [
            self._list_nodes_tool(),
            self._read_node_tool(),
            self._create_node_tool(),
            self._create_generation_node_tool(),
            # self._update_node_tool(),
            # self._create_edge_tool(),
            self._wait_for_task_tool(),
            self._search_nodes_tool(),
        ]

    def _list_nodes_tool(self) -> BaseTool:
        """Create list_canvas_nodes tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class ListCanvasNodesInput(BaseModel):
            node_type: str | None = Field(default=None, description="Optional filter by node type")
            parent_id: str | None = Field(default=None, description="Optional filter by parent group")

        @tool(args_schema=ListCanvasNodesInput)
        def list_canvas_nodes(
            node_type: str | None = None,
            parent_id: str | None = None,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """List nodes on the canvas."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                nodes = resolved_backend.list_nodes(
                    project_id=project_id,
                    node_type=node_type,
                    parent_id=parent_id,
                )

                if not nodes:
                    return "No nodes found."

                lines = ["Canvas nodes:"]
                for node in nodes:
                    lines.append(f"- {node.id} ({node.type}): {node.data}")
                return "\n".join(lines)

            except Exception as e:
                return f"Error listing nodes: {e}"

        return list_canvas_nodes

    def _read_node_tool(self) -> BaseTool:
        """Create read_canvas_node tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class ReadCanvasNodeInput(BaseModel):
            node_id: str = Field(description="Target node ID")

        @tool(args_schema=ReadCanvasNodeInput)
        def read_canvas_node(
            node_id: str,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Read a specific node's detailed data."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                node = resolved_backend.read_node(
                    project_id=project_id,
                    node_id=node_id,
                )

                if node is None:
                    return f"Node {node_id} not found."

                return f"Node {node.id}:\nType: {node.type}\nPosition: {node.position}\nData: {node.data}"

            except Exception as e:
                return f"Error reading node: {e}"

        return read_canvas_node

    def _create_node_tool(self) -> BaseTool:
        """Create create_canvas_node tool."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        backend = self.backend

        class CanvasNodeData(BaseModel):
            label: str = Field(description="Display label for the node")
            content: str | None = Field(
                default=None,
                description="Markdown/text content (text/prompt nodes)",
            )
            description: str | None = Field(
                default=None,
                description="Optional description (useful for group nodes)",
            )

            class Config:
                extra = "allow"  # Preserve any additional metadata

        class CreateCanvasNodeInput(BaseModel):
            node_type: Literal["text", "prompt", "group"] = Field(
                description="Node type to create (non-generative)"
            )
            data: CanvasNodeData = Field(description="Structured payload for text/prompt/group nodes")
            position: dict[str, float] | None = Field(
                default=None, description="Optional canvas coordinates {x, y}"
            )
            parent_id: str | None = Field(
                default=None,
                description="Optional parent group; defaults to current workspace when omitted",
            )

        @tool(args_schema=CreateCanvasNodeInput)
        def create_canvas_node(
            node_type: str,
            data: CanvasNodeData,
            position: dict[str, float] | None = None,
            parent_id: str | None = None,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Create a new node on the canvas."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")

            # Auto-set parent_id from workspace if not explicitly provided
            if parent_id is None:
                workspace_group_id = runtime.state.get("workspace_group_id")
                if workspace_group_id:
                    parent_id = workspace_group_id

            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.create_node(
                    project_id=project_id,
                    node_type=node_type,
                    data=data.model_dump(exclude_none=True),
                    position=position,
                    parent_id=parent_id,
                )

                if result.error:
                    return f"Error: {result.error}"

                # Emit SSE proposal if available
                if result.proposal:
                    writer = get_stream_writer()
                    if writer:
                        writer({
                            "action": "create_node_proposal",
                            "proposal": result.proposal,
                        })

                return f"Created node {result.node_id}"

            except Exception as e:
                return f"Error creating node: {e}"

        return create_canvas_node

    def _create_generation_node_tool(self) -> BaseTool:
        """Create create_generation_node tool (image/video)."""
        from langchain_core.tools import tool
        from langgraph.config import get_stream_writer

        backend = self.backend

        class GenerationNodeData(BaseModel):
            label: str = Field(description="Display label for the node")
            prompt: str = Field(description="Generation prompt for image/video models")
            modelName: str | None = Field(default=None, description="Optional model name override")
            actionType: Literal["image-gen", "video-gen"] | None = Field(
                default=None,
                description="Optional override; inferred from node_type when omitted",
            )
            upstreamNodeId: str | None = Field(
                default=None, description="Optional single upstream node linkage"
            )
            upstreamNodeIds: list[str] | None = Field(
                default=None, description="Optional multiple upstream linkages"
            )

            class Config:
                extra = "allow"  # Preserve any additional metadata

        class CreateGenerationNodeInput(BaseModel):
            node_type: Literal["image_gen", "video_gen"] = Field(
                description="Generation node type to create"
            )
            data: GenerationNodeData = Field(description="Structured payload for generation node")
            position: dict[str, float] | None = Field(
                default=None, description="Optional canvas coordinates {x, y}"
            )
            parent_id: str | None = Field(
                default=None,
                description="Optional parent group; defaults to current workspace when omitted",
            )

        @tool(args_schema=CreateGenerationNodeInput)
        def create_generation_node(
            node_type: str,
            data: GenerationNodeData,
            position: dict[str, float] | None = None,
            parent_id: str | None = None,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Create a new generation node (image/video) on the canvas."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")

            # Auto-set parent_id from workspace if not explicitly provided
            if parent_id is None:
                workspace_group_id = runtime.state.get("workspace_group_id")
                if workspace_group_id:
                    parent_id = workspace_group_id

            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.create_node(
                    project_id=project_id,
                    node_type=node_type,
                    data=data.dict(exclude_none=True),
                    position=position,
                    parent_id=parent_id,
                )

                if result.error:
                    return f"Error: {result.error}"

                # Emit SSE proposal if available
                if result.proposal:
                    writer = get_stream_writer()
                    if writer:
                        writer({
                            "action": "create_node_proposal",
                            "proposal": result.proposal,
                        })

                return f"Created generation node {result.node_id}"

            except Exception as e:
                return f"Error creating generation node: {e}"

        return create_generation_node

    def _update_node_tool(self) -> BaseTool:
        """Create update_canvas_node tool."""
        from langchain_core.tools import tool

        backend = self.backend

        class UpdateCanvasNodeInput(BaseModel):
            node_id: str = Field(description="Target node ID")
            data: dict[str, Any] | None = Field(default=None, description="Partial data update")
            position: dict[str, float] | None = Field(
                default=None, description="Optional position update {x, y}"
            )

        @tool(args_schema=UpdateCanvasNodeInput)
        def update_canvas_node(
            node_id: str,
            data: dict[str, Any] | None = None,
            position: dict[str, float] | None = None,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Update an existing node."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.update_node(
                    project_id=project_id,
                    node_id=node_id,
                    data=data,
                    position=position,
                )

                if result.error:
                    return f"Error: {result.error}"

                return f"Updated node {node_id}"

            except Exception as e:
                return f"Error updating node: {e}"

        return update_canvas_node

    def _create_edge_tool(self) -> BaseTool:
        """Create create_canvas_edge tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class CreateCanvasEdgeInput(BaseModel):
            source: str = Field(description="Source node ID")
            target: str = Field(description="Target node ID")
            source_handle: str | None = Field(default=None, description="Optional source handle")
            target_handle: str | None = Field(default=None, description="Optional target handle")

        @tool(args_schema=CreateCanvasEdgeInput)
        def create_canvas_edge(
            source: str,
            target: str,
            source_handle: str | None = None,
            target_handle: str | None = None,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Create an edge connecting two nodes."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.create_edge(
                    project_id=project_id,
                    source=source,
                    target=target,
                    source_handle=source_handle,
                    target_handle=target_handle,
                )

                if result.error:
                    return f"Error: {result.error}"

                return f"Created edge from {source} to {target}"

            except Exception as e:
                return f"Error creating edge: {e}"

        return create_canvas_edge

    def _wait_for_task_tool(self) -> BaseTool:
        """Create wait_for_generation tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class WaitForGenerationInput(BaseModel):
            node_id: str = Field(description="Node with generation task")
            timeout_seconds: float = Field(default=30.0, description="Max wait time in seconds")

        @tool(args_schema=WaitForGenerationInput)
        def wait_for_generation(
            node_id: str,
            timeout_seconds: float = 30.0,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Wait for a generation task (image/video) to complete."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                result = resolved_backend.wait_for_task(
                    project_id=project_id,
                    node_id=node_id,
                    timeout_seconds=timeout_seconds,
                )

                if result.error:
                    return f"Error: {result.error}"

                if result.status == "completed":
                    return f"Task completed. Output: {result.output}"
                elif result.status == "generating":
                    return f"Task still generating. Please retry wait_for_generation after a moment."
                elif result.status == "failed":
                    return f"Task failed: {result.error}"
                else:
                    return f"Node not found: {node_id}"

            except Exception as e:
                return f"Error waiting for task: {e}"

        return wait_for_generation

    def _search_nodes_tool(self) -> BaseTool:
        """Create search_canvas tool."""
        from langchain_core.tools import tool

        backend = self.backend
        class SearchCanvasInput(BaseModel):
            query: str = Field(description="Search query")
            node_types: list[str] | None = Field(default=None, description="Optional filter by node types")

        @tool(args_schema=SearchCanvasInput)
        def search_canvas(
            query: str,
            node_types: list[str] | None = None,
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Search nodes by content or metadata."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            project_id = runtime.state.get("project_id", "")
            resolved_backend = backend(runtime) if callable(backend) else backend

            try:
                nodes = resolved_backend.search_nodes(
                    project_id=project_id,
                    query=query,
                    node_types=node_types,
                )

                if not nodes:
                    return f"No nodes found matching '{query}'."

                lines = [f"Search results for '{query}':"]
                for node in nodes:
                    lines.append(f"- {node.id} ({node.type}): {node.data}")
                return "\n".join(lines)

            except Exception as e:
                return f"Error searching: {e}"

        return search_canvas

class TodoListMiddleware(AgentMiddleware):
    """Middleware for task planning and tracking.

    Provides tools for agents to break down complex tasks into steps.
    """

    def __init__(self):
        """Initialize todo list middleware."""
        pass

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        """Add todo tools to the model request."""
        # Generate todo tools
        todo_tools = self._generate_todo_tools()

        # Merge with existing tools
        request.tools = [*request.tools, *todo_tools]

        # Add todo-specific system prompt
        todo_prompt = """
You have access to todo list tools for planning:
- write_todos: Create or update task list
- read_todos: Read current task list

Use these to break down complex tasks into manageable steps.
"""
        if request.system_prompt:
            request.system_prompt = f"{request.system_prompt}\n\n{todo_prompt}"
        else:
            request.system_prompt = todo_prompt

        return handler(request)

    def _generate_todo_tools(self) -> list[BaseTool]:
        """Generate todo tools."""
        from langchain_core.tools import tool
        class TodoItem(BaseModel):
            content: str = Field(description="Task content")
            status: str = Field(default="pending", description="Task status label")

        class WriteTodosInput(BaseModel):
            todos: list[TodoItem] = Field(description="List of tasks")

        @tool(args_schema=WriteTodosInput)
        def write_todos(
            todos: list[TodoItem],
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Create or update task list."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            # Store in state
            runtime.state["todos"] = todos
            return f"Updated task list with {len(todos)} items."

        @tool
        def read_todos(
            state: Annotated[dict, InjectedState] = None,
            config: RunnableConfig = None,
            tool_call_id: Annotated[str, InjectedToolCallId] = None,
        ) -> str:
            """Read current task list."""
            if state is None:
                return "Error: Runtime context required"
            
            runtime = ToolRuntime(state=state, config=config or {}, tool_call_id=tool_call_id or "")

            todos = runtime.state.get("todos", [])
            if not todos:
                return "No tasks in list."

            lines = ["Task list:"]
            for i, todo in enumerate(todos, 1):
                status = todo.get("status", "pending")
                content = todo.get("content", "")
                lines.append(f"{i}. [{status}] {content}")
            return "\n".join(lines)

        return [write_todos, read_todos]
