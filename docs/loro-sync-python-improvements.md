# Python Loro Sync 改进建议

## 背景

前端 Loro sync 机制最近做了重要改动，采用了更现代的 `subscribeLocalUpdates` 机制。Python 后端目前仍使用手动 export 方式。

## 前端改动总结

### 1. 使用 `subscribeLocalUpdates` 自动发送更新

**旧方式**（手动 export）：
```typescript
const versionBefore = doc.version();
nodesMap.set(nodeId, nodeData);
const update = doc.export({ mode: 'update', from: versionBefore });
sendUpdate(update);
```

**新方式**（自动订阅）：
```typescript
// 初始化时订阅
doc.subscribeLocalUpdates((update: Uint8Array) => {
  sendUpdate(update);
});

// 操作时只需 commit
nodesMap.set(nodeId, nodeData);
doc.commit(); // 自动触发 subscribeLocalUpdates
```

### 2. 区分本地和远程更新

```typescript
doc.subscribe((event) => {
  // event.by: "local" | "import" | "checkout"

  if (event.by === 'local') {
    // 跳过 React state 更新（避免循环）
    return;
  }

  // 只有远程更新才同步到 React state
  const { nodes, edges, tasks } = readStateFromLoro();
  onNodesChange(nodes);
  // ...
});
```

### 3. 连接时发送完整 snapshot

```typescript
ws.onopen = () => {
  const snapshot = doc.export({ mode: 'snapshot' });
  ws.send(snapshot);
};
```

## Python 后端当前实现

### nodes.py 中的操作
```python
def add_node(self, node_id: str, node_data: dict[str, Any]):
    version_before = self.doc.oplog_vv
    nodes_map = self.doc.get_map("nodes")
    nodes_map.insert(node_id, node_data)
    update = self.doc.export(ExportMode.Updates(version_before))
    self._send_update(update)
```

### connection.py 中的连接
```python
async def connect(self):
    # ... 建立 WebSocket 连接

    # 等待服务器发送初始 snapshot
    initial_msg = await asyncio.wait_for(self.ws.recv(), timeout=30.0)
    self.doc.import_(initial_data)

    # 开始监听
    asyncio.create_task(self._listen())
```

## 需要改进吗？

### ✅ 当前实现仍然可用

1. **核心协议未变**：服务器仍然接受 binary updates
2. **手动 export 是标准方式**：Loro 官方文档仍支持这种方式
3. **Python 端主要是单向推送**：Agent → Frontend，不涉复杂双向同步

### ⚠️ 潜在问题

1. **缺少显式 commit**
   - 虽然 `insert/delete` 会自动触发，但最佳实践是显式调用
   - 可能导致时间戳/事务边界不清晰

2. **连接时未主动同步状态**
   - 前端现在会在连接时发送 snapshot
   - Python 端只是被动接收，可能导致状态不一致

3. **代码风格不一致**
   - 前后端使用不同的同步机制，增加维护成本

## 建议的改进方案

### 方案 A：最小改动（推荐）

只添加显式 `commit()` 调用，保持手动 export 方式：

```python
# nodes.py
def add_node(self, node_id: str, node_data: dict[str, Any]):
    logger.info(f"[LoroSyncClient] ➕ Adding node: {node_id}")

    version_before = self.doc.oplog_vv
    nodes_map = self.doc.get_map("nodes")
    nodes_map.insert(node_id, node_data)

    # 添加显式 commit
    self.doc.commit()

    update = self.doc.export(ExportMode.Updates(version_before))
    self._send_update(update)
    logger.info(f"[LoroSyncClient] ✅ Node added: {node_id}")
```

**优点**：
- 改动最小，风险低
- 保持现有代码结构
- 明确事务边界

**缺点**：
- 仍然需要手动管理 version tracking
- 与前端实现方式不一致

### 方案 B：采用 subscribe_local_update（对齐前端）

使用 `subscribe_local_update` 自动发送更新：

```python
# connection.py
class LoroConnectionMixin:
    def __init__(self):
        # ...
        self._local_update_sub = None

    async def connect(self):
        # ... WebSocket 连接代码

        # 订阅本地更新
        self._local_update_sub = self.doc.subscribe_local_update(
            lambda update: self._send_update(bytes(update))
        )

        # 连接后发送初始 snapshot（对齐前端）
        snapshot = self.doc.export(ExportMode.Snapshot)
        logger.info(f"[LoroSyncClient] 📤 Sending initial snapshot ({len(snapshot)} bytes)")
        await self.ws.send(snapshot)

        asyncio.create_task(self._listen())

    async def disconnect(self):
        if self._local_update_sub:
            # 取消订阅（如果 Loro Python 支持）
            self._local_update_sub = None
        # ...

# nodes.py
def add_node(self, node_id: str, node_data: dict[str, Any]):
    logger.info(f"[LoroSyncClient] ➕ Adding node: {node_id}")

    nodes_map = self.doc.get_map("nodes")
    nodes_map.insert(node_id, node_data)

    # 只需 commit，subscribeLocalUpdate 会自动发送
    self.doc.commit()

    logger.info(f"[LoroSyncClient] ✅ Node added: {node_id}")

def update_node(self, node_id: str, node_data: dict[str, Any]):
    logger.info(f"[LoroSyncClient] 🔄 Updating node: {node_id}")

    nodes_map = self.doc.get_map("nodes")
    existing = self.get_node(node_id) or {}

    merged = {**existing, **node_data}
    if "data" in existing and "data" in node_data:
        merged["data"] = {**existing.get("data", {}), **node_data.get("data", {})}

    nodes_map.insert(node_id, merged)
    self.doc.commit()

    logger.info(f"[LoroSyncClient] ✅ Node updated: {node_id}")

def remove_node(self, node_id: str):
    logger.info(f"[LoroSyncClient] ➖ Removing node: {node_id}")

    nodes_map = self.doc.get_map("nodes")
    nodes_map.delete(node_id)
    self.doc.commit()

    logger.info(f"[LoroSyncClient] ✅ Node removed: {node_id}")
```

**优点**：
- 与前端实现一致
- 代码更简洁（无需手动 export）
- 自动处理版本追踪
- 更易维护

**缺点**：
- 改动较大，需要充分测试
- 需要验证 Python Loro 的 `subscribe_local_update` 行为是否与 JS 版本一致

### 方案 C：混合方案

保持手动 export，但添加连接时的 snapshot 同步：

```python
# connection.py
async def connect(self):
    # ... 建立连接

    # 等待服务器的初始状态
    initial_msg = await asyncio.wait_for(self.ws.recv(), timeout=30.0)
    self.doc.import_(initial_data)

    # 连接后主动发送自己的状态（对齐前端）
    snapshot = self.doc.export(ExportMode.Snapshot)
    logger.info(f"[LoroSyncClient] 📤 Sending initial snapshot ({len(snapshot)} bytes)")
    await self.ws.send(snapshot)

    asyncio.create_task(self._listen())
```

## 推荐方案

**建议采用方案 A（短期） + 方案 B（长期）**：

1. **短期（本次）**：添加显式 `commit()` 调用
   - 风险低，改动小
   - 立即改善代码质量

2. **长期（下次迭代）**：迁移到 `subscribe_local_update`
   - 与前端保持一致
   - 充分测试后再部署

## 测试建议

无论选择哪个方案，都需要测试以下场景：

1. **Python Agent 添加节点** → 前端实时显示
2. **前端手动添加节点** → Python Agent 读取到最新状态
3. **并发修改**：前端和 Agent 同时修改同一节点
4. **断线重连**：WebSocket 断开后重连，状态是否一致
5. **跨会话持久化**：关闭浏览器/重启 Agent，数据是否保留

## 参考资料

- 前端改动：`apps/web/app/hooks/useLoroSync.ts`
- Python 实现：`apps/api/src/master_clash/loro_sync/`
- Loro 文档：https://loro.dev/docs
