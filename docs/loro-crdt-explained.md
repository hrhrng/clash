# Loro CRDT 原理与同步机制详解

## 什么是 CRDT？

**CRDT（Conflict-free Replicated Data Type，无冲突复制数据类型）** 是一种特殊的数据结构，可以在多个副本之间自动同步，无需中央协调器就能解决冲突。

### 类比：Google Docs 的协同编辑

想象你和同事同时编辑一个 Google Docs 文档：
- 你在第 1 行输入 "Hello"
- 同事在第 2 行输入 "World"
- 两个操作同时发生，但最终文档正确显示两行内容

这就是 CRDT 的核心能力：**自动合并并发操作**。

## Loro CRDT 的核心概念

### 1. Document（文档）

```typescript
const doc = new LoroDoc();
```

这是整个数据的容器，想象成一个"魔法笔记本"：
- 每个人都有一份笔记本的副本
- 每个人都可以在自己的副本上写字
- 笔记本会自动同步所有人的修改

### 2. Container（容器）

Loro 提供几种数据结构：

```typescript
// Map：键值对（类似 JavaScript 对象）
const nodesMap = doc.getMap('nodes');
nodesMap.set('node_1', { type: 'image', x: 100, y: 200 });

// List：数组
const list = doc.getList('items');
list.insert(0, 'hello');

// Text：富文本
const text = doc.getText('content');
text.insert(0, 'Hello World');
```

在你的项目中：
- `nodes` Map：存储所有画布节点
- `edges` Map：存储所有连线
- `tasks` Map：存储所有任务信息

### 3. Version Vector（版本向量）

这是 CRDT 的核心机制之一。每个文档都有一个"版本号"：

```typescript
const version = doc.version();
// 返回类似：{ peer_1: 5, peer_2: 3 }
// 含义：peer_1 做了 5 次操作，peer_2 做了 3 次操作
```

**为什么需要版本向量？**

假设有两个客户端：
```
Client A: 初始状态 → 添加节点1 → 添加节点2
          version: {}  → {A:1}     → {A:2}

Client B: 初始状态 → 添加节点3
          version: {}  → {B:1}
```

当它们同步时，通过版本向量可以知道：
- A 需要 B 的操作：节点3
- B 需要 A 的操作：节点1、节点2

## Loro 的同步机制

### 方式 1：手动 Export/Import（旧方式）

这是最基础的同步方式，就像"手动复制粘贴"：

```typescript
// === Client A ===
const versionBefore = doc.version();  // 记录当前版本：{A:5}

// 做一些修改
nodesMap.set('node_1', { x: 100 });

// 导出这次修改的"增量"
const update = doc.export({
  mode: 'update',
  from: versionBefore  // 从 {A:5} 到现在的变化
});

// 发送给服务器
websocket.send(update);

// === Client B ===
// 收到 update
websocket.onmessage = (event) => {
  const update = event.data;
  doc.import(update);  // 应用这个变化
};
```

**问题**：
- 需要手动管理 `versionBefore`
- 容易忘记 export
- 代码繁琐

### 方式 2：subscribeLocalUpdates（新方式，自动化）

这是"自动同步"机制，就像开启了"自动保存"：

```typescript
// === 初始化时订阅 ===
doc.subscribeLocalUpdates((update: Uint8Array) => {
  // 每次本地修改后，这个回调会自动被调用
  console.log('本地发生了修改，自动生成 update');
  websocket.send(update);
});

// === 之后的操作 ===
// 只需要修改数据 + commit，不需要手动 export
nodesMap.set('node_1', { x: 100 });
doc.commit();  // 提交这次修改，自动触发 subscribeLocalUpdates
```

**原理**：
1. `subscribeLocalUpdates` 注册一个监听器
2. 每次调用 `commit()` 时，Loro 自动计算增量
3. 自动调用回调函数，传入 update
4. 你只需要在回调里发送 update

## 完整的同步流程

让我用一个实际例子来说明：

### 场景：用户在前端添加一个节点，Agent 在后端也需要看到

```
时刻 T0: 初始状态
┌─────────────┐           ┌─────────────┐           ┌─────────────┐
│   前端      │           │  Sync Server│           │  Python Agent│
│             │           │             │           │             │
│ doc: {}     │           │  doc: {}    │           │  doc: {}    │
└─────────────┘           └─────────────┘           └─────────────┘

时刻 T1: 前端添加节点
┌─────────────┐
│   前端      │
│             │
│ nodesMap.set('node_1', { x: 100 })
│ doc.commit()  ──────┐
│                     │
│ subscribeLocalUpdates 被触发
│                     │
│ update = [bytes]    │  // Loro 自动生成的二进制数据
└─────────────────────┘
         │
         │ WebSocket.send(update)
         ▼
    ┌─────────────┐
    │ Sync Server │
    │             │
    │ doc.import(update)  // 服务器应用这个更新
    │ doc: { nodes: { node_1: { x: 100 }}}
    └─────────────┘
         │
         │ 广播给所有其他客户端
         ▼
    ┌─────────────┐
    │ Python Agent│
    │             │
    │ ws.onmessage(update)
    │ doc.import(update)  // Agent 应用这个更新
    │ doc: { nodes: { node_1: { x: 100 }}}
    └─────────────┘
```

### 核心数据：Update 是什么？

`update` 是一段二进制数据，包含：

```
Update 的内容（简化版）：
{
  操作类型: "insert",
  容器: "nodes",
  键: "node_1",
  值: { x: 100 },
  版本: { peer_id: "abc", counter: 5 },
  时间戳: 1234567890
}
```

实际是经过高度优化的二进制格式，但逻辑上就是"谁在什么时候对什么数据做了什么操作"。

## doc.commit() 的作用

`commit()` 就像 Git 的 commit：

```typescript
// 开始一个"事务"
nodesMap.set('node_1', { x: 100 });
nodesMap.set('node_2', { x: 200 });
nodesMap.set('node_3', { x: 300 });

// 提交事务，这三个操作会被打包成一个 update
doc.commit();
```

**如果不调用 commit()**：
- 操作仍然会生效（在本地）
- 但可能不会立即同步（取决于实现）
- 时间戳可能不准确
- 事务边界不清晰

**最佳实践**：每次逻辑操作后都 commit

```typescript
// ✅ 好的做法
function addNode(id, data) {
  nodesMap.set(id, data);
  doc.commit();  // 明确的事务边界
}

// ❌ 不推荐（虽然可能也能工作）
function addNode(id, data) {
  nodesMap.set(id, data);
  // 没有 commit，依赖 Loro 的自动机制
}
```

## doc.subscribe() 的作用

`subscribe` 用于监听文档的**所有变化**（本地 + 远程）：

```typescript
doc.subscribe((event) => {
  console.log('文档发生了变化！');
  console.log('变化来源：', event.by);
  // event.by 可能是：
  // - 'local': 本地修改（你自己调用 set/delete 等）
  // - 'import': 远程修改（通过 import() 导入）
  // - 'checkout': 版本切换
});
```

### 前端的使用场景

```typescript
// 订阅文档变化
doc.subscribe((event) => {
  // 保存到 IndexedDB（无论本地还是远程修改）
  const snapshot = doc.export({ mode: 'snapshot' });
  saveToDB(snapshot);

  // 更新 React state（只针对远程修改）
  if (event.by === 'local') {
    // 跳过！因为 React state 已经是最新的
    // （用户点击 → 更新 React state → 调用 addNode → 修改 Loro）
    return;
  }

  // 远程修改：从 Loro 读取最新数据，更新 React state
  const nodes = Array.from(nodesMap.entries());
  setNodes(nodes);  // 更新 UI
});
```

**为什么要区分 local 和 import？**

```
用户点击添加节点
  ↓
setNodes([...nodes, newNode])  ← React state 已经更新
  ↓
addNode(newNode)  ← 更新 Loro doc
  ↓
doc.subscribe 触发，event.by = 'local'
  ↓
如果这里再调用 setNodes()，就会重复更新！
```

## Python 的当前实现

```python
# nodes.py
def add_node(self, node_id: str, node_data: dict):
    # 1️⃣ 记录当前版本
    version_before = self.doc.oplog_vv

    # 2️⃣ 修改数据
    nodes_map = self.doc.get_map("nodes")
    nodes_map.insert(node_id, node_data)

    # 3️⃣ 导出增量
    update = self.doc.export(ExportMode.Updates(version_before))

    # 4️⃣ 发送
    self._send_update(update)
```

这是手动方式，等价于前端的旧实现。

## Python 可以改成的样子（对齐前端）

```python
# connection.py
class LoroConnectionMixin:
    async def connect(self):
        # ... 连接 WebSocket

        # 订阅本地更新（类似前端的 subscribeLocalUpdates）
        self._local_update_sub = self.doc.subscribe_local_update(
            lambda update: self._send_update(bytes(update))
        )

        # 连接后发送初始状态
        snapshot = self.doc.export(ExportMode.Snapshot)
        await self.ws.send(snapshot)

# nodes.py
def add_node(self, node_id: str, node_data: dict):
    nodes_map = self.doc.get_map("nodes")
    nodes_map.insert(node_id, node_data)

    # 只需 commit，subscribe_local_update 会自动发送
    self.doc.commit()
```

简化了很多代码，而且不容易出错。

## 两种模式对比

### Export/Import 模式（手动）

```
优点：
✅ 完全控制何时同步
✅ 可以批量操作后再一次性同步
✅ 适合低频同步场景

缺点：
❌ 代码繁琐
❌ 容易忘记 export
❌ 需要手动管理版本号
```

### Subscribe 模式（自动）

```
优点：
✅ 代码简洁
✅ 不会忘记同步
✅ 自动管理版本
✅ 与前端一致

缺点：
❌ 每次 commit 都会触发（可能过于频繁？）
❌ 需要理解回调机制
```

## Snapshot vs Update

### Snapshot（快照）

完整的文档状态：

```typescript
const snapshot = doc.export({ mode: 'snapshot' });
// 包含整个文档的所有数据
// 就像 Git 的完整仓库克隆
```

**用途**：
- 初次连接时发送/接收
- 持久化到数据库
- 跨会话恢复状态

### Update（增量）

只包含变化的部分：

```typescript
const update = doc.export({
  mode: 'update',
  from: versionBefore
});
// 只包含从 versionBefore 到现在的变化
// 就像 Git 的 diff
```

**用途**：
- 实时同步
- 减少网络传输
- 增量更新

## 实际场景演示

### 场景 1：Agent 生成视频，添加到画布

```python
# Python Agent
async def generate_video(prompt: str):
    # 1. 调用 API 生成视频
    video_url = await kling_api.generate(prompt)

    # 2. 添加到 Loro 文档
    client.add_node('node_video_123', {
        'type': 'action-badge-video',
        'position': {'x': 100, 'y': 200},
        'data': {
            'url': video_url,
            'status': 'completed'
        }
    })

    # 3. 如果使用新方式，这里会自动同步到前端
    # 如果使用旧方式，add_node 内部会手动 export + send

# 前端会立即看到新节点出现在画布上！
```

### 场景 2：用户在前端移动节点

```typescript
// 前端
function onNodeDrag(nodeId: string, newPosition: Position) {
  // 1. 更新 React state（立即响应，UI 流畅）
  setNodes(nodes =>
    nodes.map(n =>
      n.id === nodeId ? { ...n, position: newPosition } : n
    )
  );

  // 2. 更新 Loro 文档
  updateNode(nodeId, { position: newPosition });
  // 内部会调用 doc.commit()，自动同步
}

// Python Agent
# 通过 subscribe 或 on_update 回调，可以实时看到节点移动
def on_update(state):
    nodes = state['nodes']
    node = nodes.get('node_123')
    print(f"节点位置：{node['position']}")
```

## 总结

1. **Loro CRDT** = 自动同步的"魔法数据结构"
2. **Version Vector** = 版本追踪，知道谁做了什么
3. **Export/Import** = 手动复制粘贴（旧方式）
4. **subscribeLocalUpdates** = 自动同步（新方式）
5. **commit()** = 提交事务，触发同步
6. **subscribe()** = 监听所有变化（本地+远程）

前端已经升级到自动同步模式，Python 端还在用手动模式。建议：
- **短期**：加上 `commit()` 调用，规范代码
- **长期**：切换到 `subscribe_local_update`，与前端对齐

还有什么不清楚的吗？😊
