# Loro Canvas Sync Integration - 完成指南

## 🎯 概述

将画布状态从 SSE 迁移到 Loro CRDT 实时同步。

**关键变化**：
- ❌ 移除：Agent 通过 SSE 发送 `node_proposal` 事件
- ✅ 新增：Agent 直接写入 Loro 文档，自动同步到所有客户端
- ✅ 保留：所有其他 SSE 功能（thinking, tool_call 等）完全不变

---

## 📚 文档索引

### 架构文档
1. **[LORO_CANVAS_SYNC_SUMMARY.md](LORO_CANVAS_SYNC_SUMMARY.md)** - 总体架构和设计
2. **[apps/loro-sync-server/LORO_SCHEMA.md](apps/loro-sync-server/LORO_SCHEMA.md)** - Loro 文档数据结构
3. **[apps/loro-sync-server/TASK_POLLING_ARCHITECTURE.md](apps/loro-sync-server/TASK_POLLING_ARCHITECTURE.md)** - 任务轮询机制

### 实现指南
4. **[FRONTEND_INTEGRATION_GUIDE.md](apps/web/FRONTEND_INTEGRATION_GUIDE.md)** - 前端集成指南
5. **[AGENT_INTEGRATION_GUIDE.md](apps/api/AGENT_INTEGRATION_GUIDE.md)** - Agent 集成快速指南
6. **[LORO_MIGRATION_GUIDE.md](apps/api/LORO_MIGRATION_GUIDE.md)** - Agent 详细迁移步骤

### 清单
7. **[FINAL_INTEGRATION_CHECKLIST.md](FINAL_INTEGRATION_CHECKLIST.md)** - 集成清单（本文档简化版）

---

## 🚀 快速开始

### 1. 启动 Sync Server

```bash
cd apps/loro-sync-server
pnpm dev
```

访问 http://localhost:8787 应该看到：`Loro Sync Server`

### 2. 测试 Frontend 连接

在 `apps/web/app/components/ProjectEditor.tsx` 中添加：

```typescript
import { useLoroSync } from '@/app/hooks/useLoroSync';

const loroSync = useLoroSync({
  projectId: project.id,
  syncServerUrl: 'ws://localhost:8787',
  onNodesChange: setNodes,
  onEdgesChange: setEdges,
});
```

启动前端：
```bash
cd apps/web
pnpm dev
```

打开浏览器控制台，应该看到：
```
[useLoroSync] Connected to sync server
```

### 3. 测试 Agent 集成

安装依赖：
```bash
cd apps/api
uv add loro-crdt websockets
```

运行测试脚本：
```bash
python test_loro_sync.py
```

应该看到：
```
✅ Connected!
✅ Node added!
✅ Edge added!
```

同时前端应该**自动出现节点**！

---

## ✅ 已完成的工作

### Loro Sync Server
- [x] WebSocket 服务器（Cloudflare Durable Objects）
- [x] 移除 JWT 验证（简化为只需 projectId）
- [x] On-demand task polling alarm（10秒轮询，自动启停）
- [x] 支持 nodes, edges, tasks 三个 Map

### Frontend
- [x] `useLoroSync.ts` hook（无需 token）
- [x] 移除 `ChatbotCopilot.tsx` 中的 `node_proposal` SSE 监听
- [x] 完整集成指南和示例代码

### Agent Backend
- [x] `loro_sync_client.py` Python 客户端
- [x] 异步和同步两种版本
- [x] 完整集成指南
- [x] 测试脚本 `test_loro_sync.py`

---

## 🔄 你需要完成的

### Frontend（30 分钟）

**文件**: `apps/web/app/components/ProjectEditor.tsx`

**步骤**：
1. 导入 `useLoroSync`
2. 初始化 hook
3. 修改 `onAddNode` 同步到 Loro

**详见**: [FRONTEND_INTEGRATION_GUIDE.md](apps/web/FRONTEND_INTEGRATION_GUIDE.md)

### Agent（1-2 小时）

**文件**: `apps/api/src/master_clash/workflow/middleware.py`

**步骤**：
1. 安装 `loro-crdt websockets`
2. 找到两处 `create_node_proposal` 并替换
3. 添加 Loro 同步方法

**详见**: [AGENT_INTEGRATION_GUIDE.md](apps/api/AGENT_INTEGRATION_GUIDE.md)

---

## 🎨 架构图

### Before (SSE)
```
Agent ──[SSE: node_proposal]──> Frontend (手动处理)
```

### After (Loro)
```
Agent ──┐
        │
        ├──[Loro WebSocket]──> Sync Server ──[广播]──> Frontend 1
        │                           ↓                   Frontend 2
        │                       D1 持久化               Frontend 3
        │                                                 ...
        └──> SSE (thinking, tool_call, etc.) ──> Frontend
```

---

## 🧪 测试场景

### 场景 1: Agent 添加节点
```bash
# Terminal 1: Sync Server
cd apps/loro-sync-server && pnpm dev

# Terminal 2: Frontend
cd apps/web && pnpm dev

# Terminal 3: Agent
cd apps/api && python test_loro_sync.py
```

**预期**：前端自动出现节点

### 场景 2: 多用户协作
```bash
# 打开两个浏览器标签页
# 在标签页 1 拖动节点
# 标签页 2 应该实时同步
```

### 场景 3: 断线重连
```bash
# 停止 sync server
# 前端显示 "Disconnected"
# 重启 sync server
# 前端自动重连，显示 "Connected"
```

---

## 📦 代码清单

### 新增文件

```
apps/loro-sync-server/
├── LORO_SCHEMA.md
└── TASK_POLLING_ARCHITECTURE.md

apps/web/
├── app/hooks/useLoroSync.ts
└── FRONTEND_INTEGRATION_GUIDE.md

apps/api/
├── src/master_clash/tools/loro_sync_client.py
├── test_loro_sync.py
├── AGENT_INTEGRATION_GUIDE.md
└── LORO_MIGRATION_GUIDE.md

根目录/
├── LORO_CANVAS_SYNC_SUMMARY.md
├── FINAL_INTEGRATION_CHECKLIST.md
└── README_LORO_INTEGRATION.md (本文档)
```

### 修改文件

```
apps/loro-sync-server/src/
└── LoroRoom.ts (移除 JWT)

apps/web/app/
├── hooks/useLoroSync.ts (移除 token)
└── components/
    ├── ChatbotCopilot.tsx (移除 node_proposal)
    └── ProjectEditor.tsx (待集成 useLoroSync)

apps/api/src/master_clash/workflow/
└── middleware.py (待替换 SSE 为 Loro)
```

---

## ❓ FAQ

### Q: 为什么不需要 JWT？
**A**: Loro 是数据同步层，安全由上层（Frontend 认证 + Agent API key）保证。开发环境无需额外认证。

### Q: SSE 还保留吗？
**A**: 是的！只有 `node_proposal` 被移除，其他所有 SSE 事件（thinking, tool_call, agent_response 等）完全保留。

### Q: 如何回滚？
**A**: 恢复 `ChatbotCopilot.tsx` 和 `middleware.py` 中注释掉的代码即可。

### Q: 性能如何？
**A**: Loro 使用二进制协议，比 JSON SSE 更高效。典型节点 < 1KB，增量更新。

### Q: 支持离线吗？
**A**: 支持！Loro CRDT 可以离线修改，重连后自动合并。

---

## 🎉 开始集成

**建议顺序**：
1. ✅ 测试 Sync Server（已完成）
2. ✅ Frontend 集成（30 分钟）
3. ✅ Agent 集成（1-2 小时）
4. ✅ 端到端测试

**预计总时间**: 2-3 小时

**遇到问题？** 查看对应的集成指南或联系我。

Good luck! 🚀
