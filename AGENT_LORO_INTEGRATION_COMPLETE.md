# ✅ Agent Loro 集成完成

Agent 已成功集成 Loro CRDT！现在 Agent 和 Frontend 通过 Loro sync server 实时同步画布状态。

## 🎯 已完成的修改

### 1. **Agent API** (`apps/api/src/master_clash/api/main.py`)

#### 导入 Loro client
```python
from master_clash.tools.loro_sync_client import LoroSyncClient
```

#### 在流式 endpoint 中初始化 Loro
```python
async def event_stream():
    # Initialize Loro sync client
    loro_client = LoroSyncClient(
        project_id=project_id,
        sync_server_url=settings.loro_sync_url or "ws://localhost:8787",
    )

    try:
        await loro_client.connect()
        logger.info(f"[LoroSync] Connected for project {project_id}")
    except Exception as e:
        logger.error(f"[LoroSync] Failed to connect: {e}")

    # Inject Loro client into config
    config = {
        "configurable": {
            "thread_id": thread_id,
            "loro_client": loro_client,
        }
    }
```

#### 清理断开连接
```python
finally:
    try:
        await loro_client.disconnect()
        logger.info(f"[LoroSync] Disconnected for project {project_id}")
    except Exception as e:
        logger.error(f"[LoroSync] Failed to disconnect: {e}")
```

#### 移除 node_proposal SSE
```python
# REMOVED: node_proposal SSE event - now handled via Loro CRDT
# Nodes are directly written to Loro document in middleware
# if action == "create_node_proposal" and data.get("proposal"):
#     yield emitter.format_event("node_proposal", data["proposal"])
#     continue
```

---

### 2. **Middleware** (`apps/api/src/master_clash/workflow/middleware.py`)

#### `create_canvas_node` - 写入 Loro
```python
# Write node directly to Loro CRDT (replaces SSE node_proposal)
if result.proposal:
    loro_client = runtime.config.get("configurable", {}).get("loro_client")
    if loro_client and loro_client.connected:
        try:
            loro_client.add_node(result.node_id, result.proposal)
            logger.info(f"[LoroSync] Added node {result.node_id} to Loro")
        except Exception as e:
            logger.error(f"[LoroSync] Failed to add node to Loro: {e}")
    else:
        logger.warning(f"[LoroSync] Loro client not available")
```

#### `create_generation_node` - 写入 Loro
同样的逻辑，生成节点也直接写入 Loro。

#### `list_canvas_nodes` - 从 Loro 读取
```python
# Try to get nodes from Loro first (real-time state)
loro_client = runtime.config.get("configurable", {}).get("loro_client")
nodes = []

if loro_client and loro_client.connected:
    try:
        # Read from Loro document
        loro_nodes_dict = loro_client.get_all_nodes()
        # Convert to NodeInfo objects
        nodes = [
            NodeInfo(
                id=node_id,
                type=node_data.get("type", "unknown"),
                data=node_data.get("data", {}),
                parent_id=node_data.get("parentId"),
            )
            for node_id, node_data in loro_nodes_dict.items()
        ]
        logger.info(f"[LoroSync] Read {len(nodes)} nodes from Loro")
    except Exception as e:
        logger.error(f"[LoroSync] Failed to read from Loro: {e}")

# Fall back to backend if Loro not available
if not nodes:
    nodes = resolved_backend.list_nodes(project_id=project_id)
```

---

### 3. **配置** (`apps/api/src/master_clash/config.py`)

添加 Loro sync URL 配置：
```python
# Loro Sync Server
self.loro_sync_url: str | None = _env("LORO_SYNC_URL", "ws://localhost:8787")
```

---

### 4. **环境变量** (`apps/api/.env`)

添加：
```bash
# Loro Sync Server
LORO_SYNC_URL=ws://localhost:8787
```

---

## 🔄 数据流

### Agent 创建节点
```
Agent Tool (create_canvas_node)
    ↓
Backend.create_node()  # 生成节点数据
    ↓
loro_client.add_node(node_id, node_data)  # 写入本地 Loro doc
    ↓
WebSocket → Loro Sync Server  # 自动同步
    ↓
Frontend useLoroSync  # 接收更新
    ↓
画布显示节点 ✅
```

### Agent 读取节点
```
Agent Tool (list_canvas_nodes)
    ↓
loro_client.get_all_nodes()  # 从本地 Loro doc 读取
    ↓
返回节点列表 ✅
```

### Frontend 添加节点
```
用户点击工具栏
    ↓
ProjectEditor.addNode()
    ↓
loroSync.addNode(node_id, node_data)  # 写入本地 Loro doc
    ↓
WebSocket → Loro Sync Server  # 自动同步
    ↓
Agent 下次 list_canvas_nodes 时会看到 ✅
```

---

## 🎉 架构优势

### 1. **去中心化**
- ❌ 旧方式：Agent → SSE → Frontend（单向）
- ✅ 新方式：Agent ← Loro Sync Server → Frontend（双向实时同步）

### 2. **实时性**
- ❌ 旧方式：Agent 只能推送，无法看到 Frontend 的变化
- ✅ 新方式：Agent 和 Frontend 实时看到对方的修改

### 3. **一致性**
- ❌ 旧方式：Frontend 状态、Agent 状态、Database 状态可能不一致
- ✅ 新方式：Loro CRDT 保证最终一致性

### 4. **离线支持**
- ✅ Loro 支持离线编辑，重连后自动合并冲突

---

## 🚀 测试流程

### 1. 启动所有服务

Terminal 1 - Loro Sync Server:
```bash
cd apps/loro-sync-server
pnpm dev
```

Terminal 2 - Agent API:
```bash
cd apps/api
uv run uvicorn master_clash.api.main:app --reload
```

Terminal 3 - Frontend:
```bash
cd apps/web
pnpm dev
```

### 2. 测试 Agent → Frontend

1. 打开浏览器 `http://localhost:3000`
2. 创建或打开一个项目
3. 在聊天框输入：`创建一个图片生成节点`
4. 观察日志和画布

**预期结果：**
- Agent 日志：`[LoroSync] Added node {node_id} to Loro`
- Sync Server 日志：`[LoroRoom] 📥 Received update from client`
- Frontend 日志：`[useLoroSync] Received update from server`
- Frontend 日志：`[useLoroSync] Nodes updated: X nodes`
- **画布上出现新节点** ✅

### 3. 测试 Frontend → Agent

1. 在画布上手动添加一个节点（点击工具栏）
2. 在聊天框输入：`列出所有节点`

**预期结果：**
- Frontend 日志：`[ProjectEditor] Syncing new node to Loro`
- Agent 日志：`[LoroSync] Read X nodes from Loro`
- Agent 能看到刚才手动添加的节点 ✅

---

## 📝 日志示例

### Agent 成功创建节点
```
INFO:__main__:[LoroSync] Connected for project test_project_123
INFO:__main__:[LoroSync] Added node node_image_cat to Loro
INFO:__main__:[LoroSync] Disconnected for project test_project_123
```

### Sync Server 转发更新
```
[LoroRoom] 🔌 New WebSocket connection request for project: test_project_123
[LoroRoom] ✅ Auth success for project: test_project_123
[LoroRoom] 👥 Client added. Total clients: 2
[LoroRoom] 📥 Received update from client (234 bytes)
[LoroRoom] ✅ Update applied to document
[LoroRoom] 📡 Update broadcasted to 1 other clients
```

### Frontend 接收更新
```
[useLoroSync] ✅ Connected to sync server (project: test_project_123)
[useLoroSync] Received update from server (234 bytes)
[useLoroSync] ✅ Applied update from server
[useLoroSync] Document change event received
[useLoroSync] Nodes updated: 1 nodes
[ProjectEditor] Received nodes from Loro sync: 1
```

---

## ✅ 完成清单

- [x] Agent API 集成 LoroSyncClient
- [x] Middleware 写入节点到 Loro
- [x] Middleware 从 Loro 读取节点
- [x] 移除 SSE node_proposal
- [x] 添加配置和环境变量
- [x] Frontend 集成 useLoroSync（之前已完成）
- [x] 添加详细日志

---

## 🎯 下一步（可选优化）

1. **边的同步**：目前主要同步节点，可以添加边的同步
2. **更新节点**：`update_canvas_node` 工具也应该写入 Loro
3. **删除节点**：`delete_canvas_node` 工具也应该写入 Loro
4. **错误恢复**：Loro 连接失败时的降级策略
5. **性能优化**：批量操作时减少 WebSocket 消息

---

现在可以测试了！🚀
