# Master Clash 架构文档

> 基于 Cloudflare Workers + Python API 的多智能体视频协作平台

## 系统全景图 (Gateway Pattern)

所有流量通过 `auth-gateway` 统一分发，共享 D1 数据库和 R2 存储。

```mermaid
graph TD
    User((用户)) --> Gateway["Auth Gateway (:8788)"]
    
    Gateway -->|/| Web["Frontend (Next.js :3000)"]
    Gateway -->|/sync/*| Sync["Loro Sync Server (:8787)"]
    Gateway -->|/api/*| API["Python API (:8000)"]
    Gateway -->|/assets/*| R2[("R2 Assets")]
    
    subgraph "Infrastructure (Cloudflare)"
        D1[("D1 Database")]
        R2
        DO["Durable Objects (LoroRoom)"]
    end
    
    Web -->|getCloudflareContext| D1
    Sync -->|Binding| D1
    Sync -->|Binding| R2
    API -->|HTTP API| D1
    
    Sync <-->|WebSocket| DO
    API -->|Callback| Sync
```

## 任务系统 (回调 + 轮询)

**双机制设计**: Python 主动回调 + Loro 定时轮询兜底

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant Loro as Loro Sync (DO)
    participant Py as Python API
    participant R2 as R2 Storage

    Note over FE,Loro: 1. 节点创建
    FE->>Loro: WebSocket (status: generating)
    Loro->>Loro: NodeProcessor 检测节点
    
    Note over Loro,Py: 2. 任务提交
    Loro->>Py: POST /api/tasks/submit (callback_url)
    Py-->>Loro: {task_id}
    Loro->>Loro: 写入 pendingTask 字段
    Loro->>FE: WebSocket 同步

    Note over Py,R2: 3. 后台处理
    Py->>R2: 生成/上传资产
    
    Note over Py,Loro: 4a. 主动回调 (优先)
    Py->>Loro: POST /update-node
    Loro->>FE: WebSocket 同步
    
    Note over Loro,Py: 4b. 轮询补充 (容错)
    Loro->>Py: GET /api/tasks/{id}
    Py-->>Loro: {status, result_url}
    Loro->>FE: WebSocket 同步
```

## 核心组件

| 组件 | 职责 |
|------|------|
| **NodeProcessor** | 检测 `generating` 节点，提交到 Python API |
| **TaskPolling** | 轮询有 `pendingTask` 的节点状态 |
| **Python API** | 任务执行、R2 上传、回调通知 |
| **LoroRoom** | DO 编排器，WebSocket 同步 |

## 状态流转

```
generating (无 src, 无 pendingTask)
         ↓ NodeProcessor 提交任务
generating (有 pendingTask)
         ↓ Python 完成 + 回调
completed (有 src, 无 description)
         ↓ NodeProcessor 提交 describe
completed (有 pendingTask)
         ↓ Python 完成 + 回调
fin (有 description)
```

## 目录结构

```
apps/loro-sync-server/src/
├── LoroRoom.ts          # 主 Durable Object (编排器)
├── processors/
│   └── NodeProcessor.ts # 扫描节点，提交任务
├── polling/
│   └── TaskPolling.ts   # 轮询 pendingTask 节点
├── sync/
│   └── NodeUpdater.ts   # 更新节点到 Loro CRDT
└── types.ts             # 环境变量类型
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `BACKEND_API_URL` | Python API URL |
| `LORO_SYNC_URL` | Loro Sync 公网 URL (回调用) |
| `KLING_ACCESS_KEY` | Kling AI 密钥 |
| `GEMINI_API_KEY` | Gemini API 密钥 |

## 本地开发

```bash
# 统一启动
make dev-gateway-full
```

| 服务 | 本地地址 |
|------|----------|
| **统一入口** | `http://localhost:8788` |
| 前端 | `http://localhost:3000` |
| Loro Sync | `http://localhost:8787` |
| Python API | `http://localhost:8000` |
