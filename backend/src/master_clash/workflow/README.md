# Agent Workflow Architecture

This module implements a multi-agent system inspired by [deepagents](https://github.com/anthropics/deepagents), adapted for canvas-based creative workflows.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Supervisor Agent                          │
│  (Coordinates specialist agents via task delegation)         │
└─────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼               ▼
     ScriptWriter   ConceptArtist  StoryboardDesigner   Editor

Each agent uses:
├── Middleware Stack
│   ├── TodoListMiddleware     (Task planning)
│   ├── CanvasMiddleware       (Canvas operations)
│   └── SubAgentMiddleware     (Task delegation)
│
└── Backend Layer
    └── CanvasBackendProtocol  (Abstract canvas operations)
        ├── StateCanvasBackend (In-memory state)
        └── APICanvasBackend   (External API)
```

## 🆕 Workspace Scoping Feature

**NEW:** The Supervisor can now create workspace groups and scope sub-agent work!

```python
# Supervisor workflow
create_workspace_group(name="Character Design", description="...")
# → Returns: workspace-id

task_delegation(
    agent="ConceptArtist",
    instruction="Design a space explorer",
    workspace_group_id="workspace-id"  # ← Scope to workspace
)

# All nodes created by ConceptArtist automatically placed in workspace-id group!
```

**Benefits:**
- ✅ Organized canvas hierarchy
- ✅ Isolated sub-agent workspaces
- ✅ Automatic parent_id scoping
- ✅ Visual grouping

**See [WORKSPACE_SCOPING.md](WORKSPACE_SCOPING.md) for details.**

## Key Design Patterns

### 1. Middleware-Based Composition

Instead of monolithic agents, capabilities are **middleware** that stack:

```python
agent = create_agent_with_middleware(
    model=llm,
    tools=[custom_tools],
    middleware=[
        TodoListMiddleware(),      # Adds planning tools
        CanvasMiddleware(backend), # Adds canvas tools
        SubAgentMiddleware(subagents), # Adds delegation
    ]
)
```

**Benefits:**
- Each capability is independent
- Easy to enable/disable features
- Clear separation of concerns
- Extensible without modifying core

### 2. Backend Protocol Abstraction

Canvas operations are abstracted behind `CanvasBackendProtocol`:

```python
@runtime_checkable
class CanvasBackendProtocol(Protocol):
    def list_nodes(self, project_id: str, ...) -> list[NodeInfo]: ...
    def create_node(self, project_id: str, ...) -> CreateNodeResult: ...
    def wait_for_task(self, project_id: str, ...) -> TaskStatusResult: ...
    # ... more operations
```

**Implementations:**
- `StateCanvasBackend` - In-memory (default)
- `APICanvasBackend` - External API calls
- Custom backends (S3, database, etc.)

### 3. Tool Factory Pattern

Tools are **generated dynamically** based on backend capabilities:

```python
class CanvasMiddleware:
    def _generate_canvas_tools(self) -> list[BaseTool]:
        return [
            self._list_nodes_tool(),      # Factory
            self._create_node_tool(),     # Factory
            self._wait_for_task_tool(),   # Factory
            # ... more factories
        ]
```

Each factory creates a tool that:
1. Resolves the backend via `ToolRuntime`
2. Calls backend methods
3. Formats results for the LLM

### 4. SubAgent Delegation

Agents can delegate work to specialists:

```python
# Define specialists
subagents = [
    SubAgent(
        name="ScriptWriter",
        description="Creates story outlines",
        tools=[...],
        middleware=[canvas_middleware, todo_middleware],
    ),
    # ... more specialists
]

# Supervisor delegates via tool
supervisor = create_supervisor_agent(
    model=llm,
    subagents=subagents,
)
```

**Delegation flow:**
1. Supervisor calls `task_delegation` tool
2. SubAgentMiddleware routes to specialist
3. Specialist executes in isolated context
4. Result returned to supervisor

## Module Structure

```
workflow/
├── README.md                    # This file
├── INTEGRATION.md               # Integration with existing SSE + context system
├── ARCHITECTURE_SUMMARY.md      # Quick architecture summary
├── WORKSPACE_SCOPING.md         # Workspace scoping feature guide
├── backends.py                  # Canvas backend protocol + implementations
├── middleware.py                # Middleware system (Canvas, TodoList)
├── subagents.py                 # SubAgent middleware + specialist definitions
├── graph.py                     # Agent factory (create_agent_with_middleware)
├── multi_agent.py               # Main workflow entry point
└── tools.py                     # Legacy tools (being phased out)
```

## Usage Examples

### Creating a Simple Agent

```python
from master_clash.workflow.graph import create_agent_with_middleware
from master_clash.workflow.middleware import CanvasMiddleware, TodoListMiddleware
from master_clash.workflow.backends import StateCanvasBackend

llm = create_default_llm()
backend = StateCanvasBackend()

agent = create_agent_with_middleware(
    model=llm,
    tools=[],
    system_prompt="You are a helpful assistant.",
    middleware=[
        TodoListMiddleware(),
        CanvasMiddleware(backend=backend),
    ],
)

# Invoke
result = await agent.ainvoke({
    "messages": [{"role": "user", "content": "Create a text node"}],
    "project_id": "proj-123",
})
```

### Creating the Multi-Agent Workflow

```python
from master_clash.workflow.multi_agent import create_multi_agent_workflow

# Creates supervisor + 4 specialists
graph = create_multi_agent_workflow()

# Use in API
result = await graph.ainvoke({
    "messages": [{"role": "user", "content": "Create a video about space"}],
    "project_id": "proj-456",
})
```

### Custom Backend

```python
class DatabaseCanvasBackend:
    """Store canvas in PostgreSQL."""

    def __init__(self, db_url: str):
        self.db = create_engine(db_url)

    def list_nodes(self, project_id: str, ...) -> list[NodeInfo]:
        # Query database
        result = self.db.execute(
            "SELECT * FROM nodes WHERE project_id = ?",
            project_id
        )
        return [NodeInfo(**row) for row in result]

    # ... implement other methods

# Use custom backend
backend = DatabaseCanvasBackend("postgresql://...")
agent = create_agent_with_middleware(
    model=llm,
    middleware=[CanvasMiddleware(backend=backend)],
)
```

## Extending the System

### Adding a New Middleware

```python
class WeatherMiddleware(AgentMiddleware):
    """Add weather tools."""

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable,
    ) -> ModelResponse:
        # Add weather tools
        request.tools.extend(self._weather_tools())

        # Add system prompt
        request.system_prompt += "\n\nYou have access to weather data."

        return handler(request)

    def _weather_tools(self) -> list[BaseTool]:
        @tool
        def get_weather(location: str) -> str:
            # Call weather API
            return "Sunny, 75°F"

        return [get_weather]
```

### Adding a New Sub-Agent

```python
music_composer = SubAgent(
    name="MusicComposer",
    description="Composes background music",
    system_prompt="You create music for videos...",
    tools=[compose_music_tool],
    model=llm,
    middleware=[canvas_middleware, todo_middleware],
)

# Add to supervisor
supervisor = create_supervisor_agent(
    model=llm,
    subagents=[script_writer, concept_artist, ..., music_composer],
)
```

## Design Principles

Following deepagents' philosophy:

1. **Middleware as Plugins** - Every capability is a middleware intercept
2. **Backend Abstraction** - Operations decoupled from storage/API
3. **Composable Tools** - Tools generated based on backend capabilities
4. **State-First Design** - LangGraph state with atomic updates
5. **Delegation Model** - Specialists for focused tasks
6. **Extensible Layers** - Custom middleware, backends, subagents, tools

## Key Differences from deepagents

| Feature | deepagents | master-clash |
|---------|-----------|--------------|
| Primary abstraction | Filesystem | Canvas (nodes, edges) |
| Backend protocol | `BackendProtocol` | `CanvasBackendProtocol` |
| Main middleware | `FilesystemMiddleware` | `CanvasMiddleware` |
| Tool operations | `ls`, `read_file`, `write_file` | `list_nodes`, `create_node`, `wait_for_task` |
| Execution | Shell commands | Canvas API / State |
| Async patterns | Image generation waiting | Task polling (`wait_for_task`) |

## Future Enhancements

- [ ] Implement `APICanvasBackend` with HTTP calls
- [ ] Add `SummarizationMiddleware` for context management
- [ ] Add `HumanInTheLoopMiddleware` for approval gates
- [ ] Implement middleware pipeline composition (wrap_model_call, wrap_tool_call)
- [ ] Add prompt caching middleware
- [ ] Timeline editor tools via middleware
- [ ] State persistence (Store backend)
- [ ] Parallel sub-agent execution
- [ ] Tool result eviction for large outputs

## References

- [deepagents GitHub](https://github.com/anthropics/deepagents)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Backend Protocol Pattern](https://github.com/anthropics/deepagents/blob/main/libs/deepagents/deepagents/backends/protocol.py)
