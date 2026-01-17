# Backend-Frontend Integration

This document explains how the new agent architecture integrates with your existing frontend communication system.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                          │
│  - Maintains authoritative canvas state (nodes, edges)          │
│  - Syncs state to backend via POST /api/v1/project/context      │
│  - Receives proposals via SSE events                            │
└─────────────────────────────────────────────────────────────────┘
                              ▲  │
                              │  │
                    SSE Events│  │HTTP Context Updates
                              │  │
                              │  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI + LangGraph)                 │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            Agent Workflow (LangGraph)                     │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Supervisor → SubAgents (via SubAgentMiddleware)   │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                       ▼                                   │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  CanvasMiddleware                                  │  │  │
│  │  │  - Generates canvas tools dynamically              │  │  │
│  │  │  - Emits SSE events via get_stream_writer()        │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                       ▼                                   │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  StateCanvasBackend                                │  │  │
│  │  │  - Reads: get_project_context()                    │  │  │
│  │  │  - Writes: Returns proposals for SSE               │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Project Context Cache (master_clash.context)           │  │
│  │  - _PROJECT_CONTEXTS: dict[project_id, ProjectContext]  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Frontend → Backend: Context Sync

Frontend periodically syncs its canvas state to backend:

```typescript
// Frontend
POST /api/v1/project/{project_id}/context
{
  "nodes": [
    {
      "id": "alpha-ocean-square",
      "type": "text",
      "position": { "x": 100, "y": 200 },
      "data": { "label": "Story Outline", "content": "..." },
      "parentId": null
    }
  ],
  "edges": [...]
}
```

```python
# Backend (api/main.py)
@app.post("/api/v1/project/{project_id}/context")
async def update_project_context(project_id: str, context: ProjectContext):
    set_project_context(project_id, context)
    return {"status": "success"}
```

### 2. Backend → Frontend: SSE Proposals

Agent creates nodes by emitting SSE events:

```python
# Backend (middleware.py)
def create_canvas_node(...):
    # Call backend
    result = backend.create_node(...)

    # Emit SSE event
    writer = get_stream_writer()
    writer({
        "action": "create_node_proposal",
        "proposal": {
            "id": "proposal-abc123",
            "type": "generative",  # or "simple", "group"
            "nodeType": "action-badge-image",
            "nodeData": {
                "id": "beta-fire-triangle",
                "label": "Character Design",
                "prompt": "Detailed description..."
            },
            "groupId": "parent-group-id",
            "message": "Proposed image_gen node: Character Design"
        }
    })
```

```typescript
// Frontend (SSE listener)
eventSource.addEventListener('custom', (e) => {
  const data = JSON.parse(e.data);

  if (data.action === 'create_node_proposal') {
    // Create node on canvas
    const node = createNodeFromProposal(data.proposal);
    addNodeToCanvas(node);

    // Trigger generation task if generative
    if (data.proposal.type === 'generative') {
      triggerGeneration(node.id);
    }
  }
});
```

### 3. Reading Canvas State

Agents read current canvas state:

```python
# Backend (backends.py)
def list_nodes(project_id: str, ...) -> list[NodeInfo]:
    context = get_project_context(project_id, force_refresh=True)
    nodes = []
    for node in context.nodes:
        nodes.append(NodeInfo(
            id=node.id,
            type=node.type,
            data=node.data,
            ...
        ))
    return nodes
```

### 4. Waiting for Generation Tasks

Agents poll for generation completion:

```python
# Backend (backends.py)
def wait_for_task(project_id: str, node_id: str) -> TaskStatusResult:
    context = get_project_context(project_id, force_refresh=True)
    asset_id = get_asset_id(node_id, context)

    if asset_id:
        return TaskStatusResult(status="completed", output={"asset_id": asset_id})
    elif find_node_by_id(node_id, context):
        return TaskStatusResult(status="generating")
    else:
        return TaskStatusResult(status="node_not_found")
```

## Key Integration Points

### StateCanvasBackend

Located in [backends.py](backends.py:234-482), this backend:

**Reads from:**
- `get_project_context(project_id)` - Frontend-synced canvas state
- `find_node_by_id(node_id, context)` - Node lookup
- `get_asset_id(node_id, context)` - Generation status

**Writes via:**
- Returns `CreateNodeResult` with `proposal` dict
- Middleware emits proposal via `get_stream_writer()`
- Frontend receives via SSE and creates actual node

### CanvasMiddleware

Located in [middleware.py](middleware.py:159-626), this middleware:

**Tool Generation:**
```python
def _generate_canvas_tools(self) -> list[BaseTool]:
    return [
        self._list_nodes_tool(),      # → list_canvas_nodes
        self._read_node_tool(),        # → read_canvas_node
        self._create_node_tool(),      # → create_canvas_node
        self._update_node_tool(),      # → update_canvas_node
        self._create_edge_tool(),      # → create_canvas_edge
        self._wait_for_task_tool(),    # → wait_for_generation
        self._search_nodes_tool(),     # → search_canvas
    ]
```

### TimelineMiddleware

Located in [middleware.py](middleware.py), this middleware adds the DSL tools for timeline management.

**Tools:**
- `read_dsl`: Reads the current timeline DSL (JSON)
- `patch_dsl`: Modifies the timeline using JSON Patch (RFC 6902)

**Note:** The previous `timeline_editor` tool has been replaced by direct DSL manipulation for more precise control. The Editor agent now maintains the DSL state directly.

## SSE Event Types

The backend emits these custom events (handled by [api/main.py](../api/main.py:544-554)):

### node_proposal
```json
{
  "action": "create_node_proposal",
  "proposal": {
    "id": "proposal-abc123",
    "type": "generative",
    "nodeType": "action-badge-image",
    "nodeData": { "id": "...", "label": "...", "prompt": "..." },
    "groupId": "parent-id",
    "message": "Proposed image_gen node: ..."
  }
}
```

## Comparison with Original Tools

| Original (tools.py) | New Architecture | Changes |
|---------------------|------------------|---------|
| `list_node_info` → Returns JSON string | `list_canvas_nodes` → Returns formatted string | ✅ Same source (`get_project_context`) |
| `read_node` → Returns JSON string | `read_canvas_node` → Returns formatted string | ✅ Same source (`find_node_by_id`) |
| `create_node` → Returns JSON with action | `create_canvas_node` → Emits SSE, returns message | ✅ **Now emits via `get_stream_writer()`** |
| `wait_for_task` → Returns status string | `wait_for_generation` → Returns status string | ✅ Same source (`get_asset_id`) |
| `timeline_editor` → Returns JSON with action | `read_dsl` / `patch_dsl` | 🔄 **Changed to File I/O (DSL)** |

## Migration Path

### Phase 1: ✅ Architecture Built
- Backend protocol abstraction
- Middleware system
- SubAgent delegation
- Tool factory pattern

### Phase 2: ✅ Integration Complete
- `StateCanvasBackend` uses `get_project_context()`
- `create_canvas_node` emits SSE proposals
- Timeline management moved to DSL file operations
- All read operations use existing context functions

### Phase 3: 🔄 Deprecate Legacy Tools (Optional)
Old tools in [tools.py](../tools.py:1-140) can be removed once confirmed working:
```python
# Can be removed after testing:
# - list_node_info (replaced by list_canvas_nodes)
# - read_node (replaced by read_canvas_node)
# - create_node (replaced by create_canvas_node)
# - wait_for_task (replaced by wait_for_generation)
# - timeline_editor (replaced by timeline_editor in middleware)
```

### Phase 4: Future Enhancements
- [ ] Implement `update_node` via SSE
- [ ] Implement `create_edge` via SSE
- [ ] Add `CompositeBackend` for hybrid storage
- [ ] Add `APICanvasBackend` for external API calls
- [ ] Add context summarization middleware
- [ ] Add human-in-the-loop middleware

## Testing the Integration

### 1. Test SSE Event Flow

```bash
# Start backend
cd backend
python -m master_clash.api.main

# In another terminal, test SSE endpoint
curl -N "http://localhost:8888/api/v1/stream/proj-test?thread_id=thread-1&user_input=Create+a+text+node"
```

Expected output:
```
event: custom
data: {"action": "create_node_proposal", "proposal": {...}}

event: text
data: {"agent": "Agent", "content": "Created node alpha-ocean-square"}
```

### 2. Test Context Sync

```bash
# Sync context from frontend
curl -X POST http://localhost:8888/api/v1/project/proj-test/context \
  -H "Content-Type: application/json" \
  -d '{
    "nodes": [
      {
        "id": "test-node-1",
        "type": "text",
        "position": {"x": 0, "y": 0},
        "data": {"label": "Test", "content": "Hello"},
        "parentId": null
      }
    ],
    "edges": []
  }'
```

### 3. Test Backend Integration

```python
from master_clash.workflow.backends import StateCanvasBackend
from master_clash.context import set_project_context, ProjectContext, NodeModel

# Setup test context
context = ProjectContext(
    nodes=[
        NodeModel(
            id="test-1",
            type="text",
            position={"x": 0, "y": 0},
            data={"label": "Test"},
            parentId=None
        )
    ],
    edges=[]
)
set_project_context("test-proj", context)

# Test backend
backend = StateCanvasBackend()
nodes = backend.list_nodes("test-proj")
print(nodes)  # Should show test-1
```

## Troubleshooting

### SSE Events Not Emitted

**Problem:** `create_canvas_node` doesn't emit SSE events

**Solution:** Ensure LangGraph is configured with streaming:
```python
config = {"configurable": {"thread_id": thread_id}}
async for event in graph.astream(
    inputs,
    config=config,
    stream_mode=["messages", "updates", "custom"],  # ← Must include "custom"
):
    ...
```

### Context Not Found

**Problem:** Backend can't read nodes

**Solution:** Frontend must sync context first:
```typescript
// Before starting agent workflow
await fetch(`/api/v1/project/${projectId}/context`, {
  method: 'POST',
  body: JSON.stringify({ nodes, edges })
});
```

### Proposals Not Creating Nodes

**Problem:** SSE events received but nodes don't appear

**Solution:** Check frontend event handler:
```typescript
eventSource.addEventListener('custom', (e) => {
  const data = JSON.parse(e.data);
  console.log('Custom event:', data);  // Debug

  if (data.action === 'create_node_proposal') {
    // Ensure this is called
    createNodeFromProposal(data.proposal);
  }
});
```

## Summary

The new architecture **fully integrates** with your existing system:

✅ **Reads** from `get_project_context()` (frontend-synced state)
✅ **Writes** via SSE proposals using `get_stream_writer()`
✅ **Maintains** single source of truth (frontend canvas)
✅ **Preserves** existing communication patterns
✅ **Adds** deepagents-style modularity and extensibility

No breaking changes to frontend required!
