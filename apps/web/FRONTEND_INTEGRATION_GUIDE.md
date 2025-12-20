# Frontend Loro Integration Guide

## 在 ProjectEditor 中集成 Loro Sync

### 1. 导入 useLoroSync

```typescript
// In ProjectEditor.tsx
import { useLoroSync } from '@/app/hooks/useLoroSync';
```

### 2. 初始化 Loro Sync

```typescript
export default function ProjectEditor({ project, initialPrompt }: ProjectEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Initialize Loro sync
  const loroSync = useLoroSync({
    projectId: project.id,
    syncServerUrl: process.env.NEXT_PUBLIC_SYNC_SERVER_URL || 'ws://localhost:8787',
    onNodesChange: (loroNodes) => {
      console.log('[ProjectEditor] Received nodes from Loro:', loroNodes);
      setNodes(loroNodes);
    },
    onEdgesChange: (loroEdges) => {
      console.log('[ProjectEditor] Received edges from Loro:', loroEdges);
      setEdges(loroEdges);
    },
    onTaskUpdate: (taskId, taskData) => {
      console.log('[ProjectEditor] Task updated:', taskId, taskData);
      // Handle task completion updates
      // For example, update node status when task completes
    },
  });

  // ... rest of component
}
```

### 3. 同步用户手动编辑到 Loro

当用户拖动节点、添加节点时，需要同步到 Loro：

```typescript
// Handle node position changes (drag)
const handleNodesChange = useCallback((changes: NodeChange[]) => {
  onNodesChange(changes); // Update local React Flow state

  // Sync position changes to Loro
  changes.forEach((change) => {
    if (change.type === 'position' && change.position && change.dragging === false) {
      // Only sync when drag ends
      loroSync.updateNode(change.id, {
        position: change.position,
      });
    }
  });
}, [onNodesChange, loroSync]);

// Handle adding new nodes
const handleAddNode = useCallback((type: string, data: any) => {
  const nodeId = generateSemanticId(); // Or use provided ID
  const newNode = {
    id: nodeId,
    type,
    position: data.position || { x: 100, y: 100 },
    data: data,
  };

  // Add to local state
  setNodes((nds) => [...nds, newNode]);

  // Sync to Loro
  loroSync.addNode(nodeId, newNode);

  return nodeId;
}, [setNodes, loroSync]);

// Handle adding edges
const handleConnect = useCallback((params: Connection) => {
  const edgeId = `e-${params.source}-${params.target}`;
  const newEdge = {
    id: edgeId,
    source: params.source,
    target: params.target,
    type: 'default',
  };

  // Add to local state
  setEdges((eds) => addEdge(params, eds));

  // Sync to Loro
  loroSync.addEdge(edgeId, newEdge);
}, [setEdges, loroSync]);
```

### 4. 处理 Agent 添加的节点

Agent 通过 Loro 添加节点后，会自动触发 `onNodesChange` 回调，无需额外处理。

```typescript
// This happens automatically:
// 1. Agent writes to Loro: loro_client.add_node(...)
// 2. Sync server broadcasts update
// 3. Frontend's useLoroSync receives update
// 4. onNodesChange callback is triggered
// 5. setNodes() updates React Flow
```

### 5. 完整示例

```typescript
'use client';

import { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
} from 'reactflow';
import { useLoroSync } from '@/app/hooks/useLoroSync';
import { generateSemanticId } from '@/lib/utils/semanticId';

export default function ProjectEditor({ project }: { project: Project }) {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Initialize Loro sync
    const loroSync = useLoroSync({
        projectId: project.id,
        syncServerUrl: 'ws://localhost:8787',
        onNodesChange: setNodes,
        onEdgesChange: setEdges,
    });

    // Sync local changes to Loro
    const handleNodesChange = useCallback((changes: NodeChange[]) => {
        onNodesChange(changes);

        // Sync position updates
        changes.forEach((change) => {
            if (change.type === 'position' && change.position && !change.dragging) {
                loroSync.updateNode(change.id, { position: change.position });
            }
        });
    }, [onNodesChange, loroSync]);

    // Add node (from toolbar)
    const addNode = useCallback((type: string) => {
        const nodeId = generateSemanticId();
        const newNode = {
            id: nodeId,
            type,
            position: { x: Math.random() * 500, y: Math.random() * 500 },
            data: { label: `New ${type}` },
        };

        loroSync.addNode(nodeId, newNode);
    }, [loroSync]);

    // Connect nodes
    const handleConnect = useCallback((params: Connection) => {
        const edgeId = `e-${params.source}-${params.target}`;
        loroSync.addEdge(edgeId, {
            id: edgeId,
            source: params.source!,
            target: params.target!,
            type: 'default',
        });
    }, [loroSync]);

    return (
        <div style={{ width: '100vw', height: '100vh' }}>
            {/* Connection status indicator */}
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
                <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: loroSync.connected ? '#22c55e' : '#ef4444',
                    color: 'white',
                    fontSize: '12px',
                }}>
                    {loroSync.connected ? '● Connected' : '● Disconnected'}
                </span>
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={handleConnect}
            >
                {/* Add your controls, background, etc. */}
            </ReactFlow>

            {/* Toolbar */}
            <div style={{ position: 'absolute', top: 10, left: 10 }}>
                <button onClick={() => addNode('default')}>Add Node</button>
            </div>
        </div>
    );
}
```

## 环境变量

在 `.env.local` 中添加：

```bash
NEXT_PUBLIC_SYNC_SERVER_URL=ws://localhost:8787
```

或者在生产环境：

```bash
NEXT_PUBLIC_SYNC_SERVER_URL=wss://loro-sync-server.your-domain.workers.dev
```

## 注意事项

### 1. 避免循环更新

❌ **错误示例**：
```typescript
const loroSync = useLoroSync({
  onNodesChange: (nodes) => {
    setNodes(nodes);
    // DON'T: This creates infinite loop
    nodes.forEach(node => loroSync.updateNode(node.id, node));
  }
});
```

✅ **正确示例**：
```typescript
const loroSync = useLoroSync({
  onNodesChange: (nodes) => {
    setNodes(nodes); // Only update local state
  }
});

// Sync to Loro only on user actions
const handleDrag = (nodeId, position) => {
  loroSync.updateNode(nodeId, { position });
};
```

### 2. 初始化加载

首次连接时，Loro 会发送当前文档状态，`onNodesChange` 会被调用，自动加载现有节点。

### 3. Debounce 拖动更新

为了减少网络流量，可以 debounce 拖动更新：

```typescript
import { debounce } from 'lodash';

const syncPositionDebounced = useMemo(
  () => debounce((nodeId: string, position: any) => {
    loroSync.updateNode(nodeId, { position });
  }, 100),
  [loroSync]
);

const handleNodesChange = useCallback((changes: NodeChange[]) => {
  onNodesChange(changes);

  changes.forEach((change) => {
    if (change.type === 'position' && change.position) {
      syncPositionDebounced(change.id, change.position);
    }
  });
}, [onNodesChange, syncPositionDebounced]);
```

## 测试

1. 启动 sync server:
   ```bash
   cd apps/loro-sync-server
   pnpm dev
   ```

2. 启动前端:
   ```bash
   cd apps/web
   pnpm dev
   ```

3. 打开浏览器控制台，应该看到：
   ```
   [useLoroSync] Connected to sync server
   [useLoroSync] Applied update from server
   ```

4. 手动添加节点，应该看到：
   ```
   [ProjectEditor] Received nodes from Loro: [...]
   ```

## 下一步

- [ ] 在 `ProjectEditor.tsx` 中集成 `useLoroSync`
- [ ] 测试手动添加节点
- [ ] 测试 Agent 添加节点（需要完成 Agent 集成）
- [ ] 测试多用户协作（打开多个浏览器标签页）
