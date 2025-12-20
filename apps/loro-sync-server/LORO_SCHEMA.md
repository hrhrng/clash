# Loro Document Schema

## Overview

The Loro document uses **CRDT Maps** to store the complete canvas state for real-time collaboration between frontend and agent.

## Document Structure

The Loro document contains three top-level Maps:

### 1. `nodes` Map

Stores all canvas nodes (videos, images, groups, action badges, etc.)

```typescript
doc.getMap('nodes'): LoroMap<string, {
  id: string;                    // Node ID (semantic or UUID)
  type: string;                  // 'video', 'image', 'group', 'action-badge', etc.
  position: { x: number; y: number };
  data: {
    label?: string;              // Display label
    assetId?: string;            // For media nodes (links to R2 storage)
    url?: string;                // Media URL (R2 or external)
    duration?: number;           // Video/audio duration in seconds
    status?: 'idle' | 'running' | 'completed' | 'failed';
    prompt?: string;             // For AI-generated nodes
    // ... other node-specific properties
  };
  parentId?: string;             // Parent node ID (for nested nodes in groups)
  extent?: 'parent';             // Constraint extent (for ReactFlow)
}>
```

**Example Node Entry**:
```json
{
  "node_image_cat_walking": {
    "id": "node_image_cat_walking",
    "type": "action-badge-image",
    "position": { "x": 100, "y": 200 },
    "data": {
      "label": "Cat Walking",
      "assetId": "asset_abc123",
      "status": "running",
      "prompt": "A cat walking in a garden"
    },
    "parentId": "group_scene1"
  }
}
```

### 2. `edges` Map

Stores all connections between nodes

```typescript
doc.getMap('edges'): LoroMap<string, {
  id: string;                    // Edge ID (format: "e-{sourceId}-{targetId}")
  source: string;                // Source node ID
  target: string;                // Target node ID
  type: string;                  // 'default', 'bezier', 'step', etc.
}>
```

**Example Edge Entry**:
```json
{
  "e-node_video_intro-node_image_cat_walking": {
    "id": "e-node_video_intro-node_image_cat_walking",
    "source": "node_video_intro",
    "target": "node_image_cat_walking",
    "type": "default"
  }
}
```

### 3. `tasks` Map

Stores AIGC task status and results (already implemented)

```typescript
doc.getMap('tasks'): LoroMap<string, {
  status: 'completed' | 'failed';
  result_url?: string;
  result_data?: any;
  completed_at?: number;
  error_message?: string;
}>
```

**Example Task Entry**:
```json
{
  "task_1234567890_abc": {
    "status": "completed",
    "result_url": "https://r2.cloudflare.com/video.mp4",
    "result_data": { "duration": 5.2 },
    "completed_at": 1234567890
  }
}
```

## Data Flow

### Agent Adding a Node (Python)

```python
import loro

# Connect to sync server
doc = loro.LoroDoc()
# ... (after WebSocket sync with server)

# Add a new image node
nodes_map = doc.get_map("nodes")
node_id = "node_image_cat"
nodes_map.insert(node_id, {
    "id": node_id,
    "type": "action-badge-image",
    "position": {"x": 100, "y": 200},
    "data": {
        "label": "Generated Cat Image",
        "assetId": "asset_xyz",
        "status": "running",
        "prompt": "A cute cat"
    }
})

# Add edge from upstream node
edges_map = doc.get_map("edges")
edge_id = f"e-{upstream_id}-{node_id}"
edges_map.insert(edge_id, {
    "id": edge_id,
    "source": upstream_id,
    "target": node_id,
    "type": "default"
})

# Changes automatically synced via WebSocket
```

### Frontend Listening for Changes (TypeScript)

```typescript
import { LoroDoc } from 'loro-crdt';

const doc = new LoroDoc();

// Subscribe to document changes
doc.subscribe((event) => {
  // Convert Loro maps to ReactFlow format
  const nodesMap = doc.getMap('nodes');
  const edgesMap = doc.getMap('edges');

  const nodes = Array.from(nodesMap.entries()).map(([id, data]) => ({
    id,
    ...data
  }));

  const edges = Array.from(edgesMap.entries()).map(([id, data]) => ({
    id,
    ...data
  }));

  // Update React Flow
  setNodes(nodes);
  setEdges(edges);
});

// Connect to sync server WebSocket
const ws = new WebSocket('wss://your-domain.example/sync/project_123');
ws.binaryType = 'arraybuffer';

ws.onopen = () => {
  console.log('Connected to sync server');
};

ws.onmessage = (event) => {
  // Apply update from server
  const update = new Uint8Array(event.data);
  doc.import(update);
};
```

### Task Completion Updates Node

When a task completes, both `tasks` and `nodes` maps are updated:

```typescript
// In LoroRoom.broadcastTaskCompletion()

// 1. Update task status
const tasksMap = this.doc.getMap('tasks');
tasksMap.set(taskId, {
  status: 'completed',
  result_url: result.result_url,
  completed_at: Date.now(),
});

// 2. Update corresponding node (if exists)
const nodesMap = this.doc.getMap('nodes');
// Find node associated with this task (by assetId or custom mapping)
const nodeId = findNodeByTaskId(taskId);
if (nodeId) {
  const node = nodesMap.get(nodeId);
  nodesMap.set(nodeId, {
    ...node,
    data: {
      ...node.data,
      status: 'completed',
      url: result.result_url,
    }
  });
}
```

## Migration from SSE `node_proposal`

### Before (SSE-based)

```
Agent ─── SSE event: 'node_proposal' ───> Frontend
                                           │
                                           └─> onAddNode() manually
```

### After (Loro-based)

```
Agent ─── Loro.getMap('nodes').insert() ───> Sync Server ───> Frontend
                                                │                  │
                                                │                  └─> Auto-sync via doc.subscribe()
                                                └─> Broadcast to all clients
```

## Benefits

1. **Single Source of Truth**: Loro document is the canonical state
2. **Automatic Conflict Resolution**: CRDT handles concurrent edits
3. **Multi-user Collaboration**: Multiple agents and users can edit simultaneously
4. **Offline Support**: Changes can be applied offline and merged later
5. **Simplified Code**: No manual state synchronization needed

## Implementation Checklist

- [x] Design schema
- [ ] Add helper methods to LoroRoom for node/edge operations
- [ ] Frontend: Connect to Loro WebSocket
- [ ] Frontend: Subscribe to document changes
- [ ] Frontend: Remove SSE `node_proposal` listener
- [ ] Agent: Install `loro` Python library
- [ ] Agent: Connect to Loro WebSocket
- [ ] Agent: Replace SSE `node_proposal` with Loro map operations
- [ ] Test end-to-end
