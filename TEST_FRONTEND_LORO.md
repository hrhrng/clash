# 测试前端 Loro 集成

前端已经集成了 `useLoroSync`，现在可以测试基本功能。

## 已完成的集成

### Frontend (`ProjectEditor.tsx`)
✅ 导入 `useLoroSync` hook
✅ 初始化 Loro sync 连接
✅ 设置 WebSocket URL（`ws://localhost:8787`）
✅ 监听 Loro 的节点和边变化
✅ 在 `addNode` 中同步新节点到 Loro
✅ 添加环境变量 `NEXT_PUBLIC_LORO_SYNC_URL`

## 测试步骤

### 1. 启动 Loro Sync Server
```bash
cd apps/loro-sync-server
pnpm dev
```

应该看到：
```
⛅️ wrangler 3.x.x
------------------
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8787
```

### 2. 启动 Next.js 前端
```bash
cd apps/web
pnpm dev
```

### 3. 打开浏览器查看日志

打开 Chrome DevTools -> Console，应该看到：

```
[useLoroSync] Initializing WebSocket connection to ws://localhost:8787/sync/{projectId}
[useLoroSync] ✅ Connected to sync server (project: {projectId})
[useLoroSync] Subscribing to document changes
```

### 4. 手动添加节点测试

在画布上添加一个节点（通过工具栏），应该看到：

```
[ProjectEditor] Syncing new node to Loro: {nodeId}
[useLoroSync] Adding node: {nodeId} (type: image)
[useLoroSync] Sending update to server (XXX bytes)
[useLoroSync] ✅ Node added: {nodeId}
```

在 Loro Sync Server 日志中应该看到：
```
[LoroRoom] 🔌 New WebSocket connection request for project: {projectId}
[LoroRoom] ✅ Auth success for project: {projectId}
[LoroRoom] 🆕 Initializing new room for project: {projectId}
[LoroRoom] 📂 Loading document for project: {projectId}
[LoroRoom] 🆕 No existing snapshot for project {projectId}, starting fresh
[LoroRoom] ✅ Room initialized for project: {projectId}
[LoroRoom] ✅ WebSocket accepted for project: {projectId}
[LoroRoom] 👥 Client added. Total clients: 1
[LoroRoom] 📤 Sending initial state to client (0 bytes)
[LoroRoom] 📥 Received update from client (XXX bytes)
[LoroRoom] ✅ Update applied to document
[LoroRoom] 📡 Update broadcasted to 0 other clients
```

## ⚠️ 当前限制

### Agent 尚未集成
Agent 还没有集成 Loro 客户端，所以：
- ❌ Agent 发送的节点提案不会出现在画布上
- ❌ Agent 无法看到画布上的节点
- ❌ Agent 仍在使用旧的 SSE 方式

这就是为什么你看到 "agent 交互正常，但画布上没有东西" 的原因。

### 解决方案

需要完成 Agent 集成：

1. 在 Agent 初始化时创建 `LoroSyncClient` 实例
2. 连接到 Loro sync server
3. 将 `node_proposal` SSE 事件替换为 `loro_sync_client.add_node()`
4. 在 Agent 中读取现有节点时使用 `loro_sync_client.get_all_nodes()`

参考文档：
- `apps/api/AGENT_INTEGRATION_GUIDE.md`
- `apps/api/LORO_MIGRATION_GUIDE.md`

## 下一步

1. ✅ 前端集成已完成
2. ⏳ **需要完成 Agent 集成** ← 这是当前的阻塞点
3. ⏳ 测试端到端流程（Agent → Loro → Frontend）

要完成 Agent 集成，请告诉我，我可以帮你：
- 找到 Agent 中发送 node_proposal 的代码
- 集成 LoroSyncClient
- 测试 Agent 到前端的完整流程
