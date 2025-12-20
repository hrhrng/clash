# 🚀 快速测试指南 - 开箱即用

所有服务已启动，所有代码已集成完成。**现在可以直接测试！**

---

## ✅ 当前状态

### 服务运行状态
```
✅ Loro Sync Server (port 8787): Running
✅ Agent API (port 8000): Running
✅ Frontend (port 3000): Running
```

### 代码集成状态
```
✅ Agent API: LoroSyncClient 已导入和初始化
✅ Middleware: 节点创建/读取已集成 Loro
✅ Frontend: useLoroSync 已集成
✅ 配置: 环境变量已设置
✅ 日志: 所有组件已添加详细日志
```

---

## 🧪 立即测试（2分钟）

### 步骤 1: 打开浏览器
```
http://localhost:3000
```

### 步骤 2: 打开开发者工具
- 按 `F12` 或 `Cmd+Option+I` (Mac)
- 切换到 **Console** 标签

### 步骤 3: 创建或打开项目
- 如果没有项目，创建一个新项目
- 进入项目的画布页面

### 步骤 4: 观察连接日志
在浏览器控制台应该看到：
```
[useLoroSync] Initializing WebSocket connection to ws://localhost:8787/sync/{projectId}
[useLoroSync] ✅ Connected to sync server (project: {projectId})
[useLoroSync] Subscribing to document changes
```

✅ **如果看到这些日志，说明 Frontend 已成功连接到 Loro Sync Server！**

---

## 🎯 测试场景 1: Agent 创建节点

### 操作：
在聊天框输入：
```
创建一个图片生成节点
```

### 预期结果：

#### 1. Agent API 日志（Terminal 2）
```
INFO:__main__:[LoroSync] Connected for project {project_id}
INFO:__main__:[LoroSync] Added node {node_id} to Loro
INFO:__main__:[LoroSync] Disconnected for project {project_id}
```

#### 2. Loro Sync Server 日志（Terminal 1）
```
[LoroRoom] 📥 Received update from client (XXX bytes)
[LoroRoom] ✅ Update applied to document
[LoroRoom] 📡 Update broadcasted to 1 other clients
```

#### 3. 浏览器控制台
```
[useLoroSync] Received update from server (XXX bytes)
[useLoroSync] ✅ Applied update from server
[useLoroSync] Document change event received
[useLoroSync] Nodes updated: 1 nodes
[ProjectEditor] Received nodes from Loro sync: 1
```

#### 4. 画布
**✅ 新节点应该立即出现在画布上！**

---

## 🎯 测试场景 2: Frontend 添加节点

### 操作：
1. 点击画布工具栏上的任意节点按钮（如"添加图片"）
2. 在聊天框输入：
   ```
   列出所有节点
   ```

### 预期结果：

#### 1. 添加节点时 - 浏览器控制台
```
[ProjectEditor] Syncing new node to Loro: {node_id}
[useLoroSync] Adding node: {node_id} (type: image)
[useLoroSync] Sending update to server (XXX bytes)
[useLoroSync] ✅ Node added: {node_id}
```

#### 2. 列出节点时 - Agent API 日志
```
INFO:__main__:[LoroSync] Connected for project {project_id}
INFO:__main__:[LoroSync] Read X nodes from Loro
INFO:__main__:[LoroSync] Disconnected for project {project_id}
```

#### 3. Agent 响应
**✅ Agent 应该能看到并列出刚才手动添加的节点！**

---

## 🎯 测试场景 3: 多客户端同步（可选）

### 操作：
1. 打开第二个浏览器窗口/标签页
2. 访问 `http://localhost:3000`
3. 打开同一个项目
4. 在第一个窗口通过 Agent 或手动添加节点
5. 观察第二个窗口

### 预期结果：
**✅ 第二个窗口应该立即显示新节点，无需刷新！**

---

## 🐛 如果出现问题

### 问题 1: 浏览器控制台没有连接日志

**原因**: Frontend 可能没有正确初始化 useLoroSync

**检查**:
1. 刷新浏览器页面
2. 确认 URL 中有 project ID
3. 查看是否有错误日志

**解决**: 如果还是没有，可能是环境变量问题：
```bash
# 检查 Frontend .env
grep LORO_SYNC_URL apps/web/.env
# 应该看到: NEXT_PUBLIC_LORO_SYNC_URL=ws://localhost:8787
```

---

### 问题 2: Agent 创建节点但画布没反应

**原因**: 可能是 Agent 连接 Loro 失败

**检查 Agent API 日志**（Terminal 2）:
```
# 查找错误
tail -100 backend.log | grep -i "loro\|error"
```

**可能看到的错误**:
- `[LoroSync] Failed to connect: ...` - Loro Sync Server 可能没运行
- `Failed to import websockets` - Python 依赖问题

**解决**:
```bash
# 确认 Loro Sync Server 运行
curl http://localhost:8787
# 应该返回: Not Found (这是正常的，说明服务在运行)

# 如果 Agent 依赖问题
cd apps/api
uv sync
```

---

### 问题 3: WebSocket 连接被拒绝

**原因**: JWT 认证可能有问题

**检查 Loro Sync Server 日志**（Terminal 1）:
```
# 查找认证错误
[LoroRoom] ❌ Auth failed: ...
```

**临时解决**:
如果是开发环境，可以暂时简化认证（只用于调试）

---

### 问题 4: 节点出现了但数据不对

**原因**: 节点数据格式可能不匹配

**检查浏览器控制台**:
```javascript
// 手动查看 Loro 文档内容
// 在浏览器控制台输入：
loroSync.doc.getMap('nodes').toJSON()
```

这会显示当前 Loro 文档中的所有节点数据。

---

## 📊 成功标志

### ✅ 完全成功的标志：

1. **浏览器控制台**:
   - ✅ 看到 `Connected to sync server`
   - ✅ 看到 `Received update from server`
   - ✅ 看到 `Nodes updated: X nodes`

2. **Agent API 日志**:
   - ✅ 看到 `[LoroSync] Connected for project...`
   - ✅ 看到 `[LoroSync] Added node ... to Loro`
   - ✅ 没有看到 `Failed to connect` 或其他错误

3. **画布**:
   - ✅ Agent 创建的节点立即出现
   - ✅ 节点位置、大小、内容都正确
   - ✅ 无需刷新页面

4. **Agent 响应**:
   - ✅ `列出所有节点` 能看到画布上的所有节点
   - ✅ 节点信息准确

### ⚠️ 部分成功的标志：

- ⚠️ Frontend 连接成功，但 Agent 创建的节点不出现
  → Agent 可能没连接 Loro，检查 Agent 日志

- ⚠️ Agent 能列出节点，但画布上没有
  → Frontend 可能没监听 Loro 变化，检查浏览器控制台

- ⚠️ 节点出现但有延迟（>1秒）
  → 可能是网络问题或 Loro Sync Server 性能问题

---

## 🎉 测试成功后

如果一切正常，你现在拥有：

1. **实时协同编辑** - 多个用户同时编辑同一个画布
2. **Agent-Frontend 双向同步** - Agent 和 Frontend 实时看到对方的修改
3. **去中心化架构** - 不依赖中心化服务器状态
4. **自动冲突解决** - Loro CRDT 自动处理冲突
5. **离线支持** - 理论上支持离线编辑后同步

---

## 📝 性能基准

### 预期性能：
- **Agent 创建节点 → Frontend 显示**: < 100ms
- **Frontend 添加节点 → Agent 看到**: < 50ms
- **多客户端同步延迟**: < 50ms
- **WebSocket 消息大小**: ~200-500 bytes per node

### 如果延迟过高（>500ms）：
- 检查网络连接
- 检查 CPU 使用率
- 查看 Loro Sync Server 日志是否有错误

---

## 🚀 开始测试！

**一切就绪，现在就打开浏览器测试吧！**

```
http://localhost:3000
```

祝测试顺利！如果遇到任何问题，参考上面的"如果出现问题"部分。

---

## 📚 相关文档

- [INTEGRATION_COMPLETE_SUMMARY.md](./INTEGRATION_COMPLETE_SUMMARY.md) - 完整集成总结
- [LORO_INTEGRATION_TEST_GUIDE.md](./LORO_INTEGRATION_TEST_GUIDE.md) - 详细测试指南
- [AGENT_LORO_INTEGRATION_COMPLETE.md](./AGENT_LORO_INTEGRATION_COMPLETE.md) - Agent 集成详情
