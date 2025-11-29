# Master Clash 架构文档

## 🎯 设计原则

**关注点分离 (Separation of Concerns)**
- **Backend (Python)**: 只负责AI生成，返回base64或临时URL
- **Frontend (Next.js)**: 负责存储、数据库、UI展示

## 📊 新架构图

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend (Next.js + React Flow)                              │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ActionBadge (用户点击执行)                             │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                   │
│           │ 1. 调用Python API生成                             │
│           ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Python Backend                                       │    │
│  │ - POST /api/generate/image → {base64: "..."}       │    │
│  │ - POST /api/generate/video → {url: "kling_url"}    │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                   │
│           │ 2. 返回base64/URL                                │
│           ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Next.js API Route (/api/upload/*)                   │    │
│  │ - 上传base64图片到R2                                   │    │
│  │ - 下载Kling视频并上传到R2                              │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                   │
│           │ 3. 返回R2 URL                                    │
│           ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Drizzle ORM → SQLite                                 │    │
│  │ - 创建assets记录                                       │    │
│  │ - name, projectId, storageKey, url, type            │    │
│  └─────────────────────────────────────────────────────┘    │
│           │                                                   │
│           │ 4. 创建节点显示                                   │
│           ▼                                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ React Flow Canvas                                    │    │
│  │ - 添加Image/Video节点                                  │    │
│  │ - 显示生成的资源                                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## 📁 目录结构

### Backend (Python/FastAPI)
```
backend/
├── .env                              # Python配置（API keys）
└── src/master_clash/
    ├── config.py                     # 配置管理
    ├── tools/
    │   ├── nano_banana.py           # Gemini图片生成
    │   └── kling_video.py           # Kling视频生成
    └── api/
        └── main.py                   # API端点
            ├── POST /api/generate/image
            └── POST /api/generate/video
```

### Frontend (Next.js)
```
frontend/
├── .env                              # Next.js配置（R2 credentials）
├── lib/
│   ├── r2-upload.ts                 # R2上传工具
│   └── db/
│       ├── drizzle.ts               # Drizzle配置
│       └── schema.ts                # 数据库schema
├── app/
│   ├── api/
│   │   └── upload/
│   │       ├── image/route.ts       # 图片上传API
│   │       └── video/route.ts       # 视频上传API
│   └── components/
│       ├── ProjectContext.tsx       # Project ID上下文
│       ├── ProjectEditor.tsx        # 主画布
│       └── nodes/
│           └── ActionBadge.tsx      # 执行逻辑
└── local.db                          # SQLite数据库
```

## 🔄 执行流程

### 图片生成流程

```typescript
// 1. 用户点击ActionBadge的Play按钮
handleExecute() {
    // 2. 调用Python Backend
    const { base64 } = await fetch('http://localhost:8000/api/generate/image', {
        body: JSON.stringify({ prompt, aspect_ratio })
    });

    // 3. 上传到R2（通过Next.js API）
    const { storageKey, url } = await fetch('/api/upload/image', {
        body: JSON.stringify({ base64Data: base64, projectId, fileName })
    });

    // 4. 写入数据库
    const [asset] = await db.insert(assets).values({
        name, projectId, storageKey, url, type: 'image'
    }).returning();

    // 5. 创建节点
    addNodes({ id: asset.id, type: 'image', data: { src: url } });
}
```

### 视频生成流程

```typescript
// 1. 用户点击ActionBadge的Play按钮
handleExecute() {
    // 2. 调用Python Backend（需要image_url作为输入）
    const { url: klingUrl } = await fetch('http://localhost:8000/api/generate/video', {
        body: JSON.stringify({ image_url, prompt, duration: 5 })
    });

    // 3. 下载Kling视频并上传到R2（通过Next.js API）
    const { storageKey, url } = await fetch('/api/upload/video', {
        body: JSON.stringify({ videoUrl: klingUrl, projectId, fileName })
    });

    // 4. 写入数据库
    const [asset] = await db.insert(assets).values({
        name, projectId, storageKey, url, type: 'video'
    }).returning();

    // 5. 创建节点
    addNodes({ id: asset.id, type: 'video', data: { src: url } });
}
```

## ⚙️ 配置说明

### Backend (.env)
```bash
# AI API Keys（必需）
GOOGLE_API_KEY=your-google-api-key
KLING_ACCESS_KEY=your-kling-access-key
KLING_SECRET_KEY=your-kling-secret-key

# 不需要R2配置！Backend不再处理存储
```

### Frontend (.env)
```bash
# R2 Object Storage（必需）
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://pub-xxx.r2.dev

# Backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

## 🎨 优势

### ✅ 更清晰的职责划分
- **Backend**: 专注于AI生成，无需关心存储和数据库
- **Frontend**: 完全控制资源管理，更灵活

### ✅ 减少耦合
- Backend不需要访问Frontend的数据库
- Frontend可以独立决定存储策略

### ✅ 更好的错误处理
- 每个步骤可以独立重试
- 上传失败不影响生成结果（base64已返回）

### ✅ 符合现代架构
- Next.js API Routes处理文件上传
- 客户端组件直接使用Drizzle ORM
- Python专注于计算密集型任务

## 🚀 部署注意事项

### Backend (Python)
- 可以部署到任何支持Python的平台（Render, Railway, Fly.io等）
- 只需要AI API的访问权限
- 无状态服务，易于扩展

### Frontend (Next.js)
- 部署到Vercel/Cloudflare Pages
- 需要配置R2环境变量
- SQLite可以用Cloudflare D1替代（生产环境）

## 🔐 安全性

- ✅ R2 credentials只在Next.js API Routes中使用（服务端）
- ✅ 用户无法直接访问R2 credentials
- ✅ Python Backend无需数据库访问权限
- ✅ 每个项目的assets通过projectId隔离

## 📝 下一步优化

1. **批量生成**: count > 1时生成多个资源
2. **进度追踪**: WebSocket实时更新生成进度
3. **资源管理**: 在UI中浏览、删除、重命名assets
4. **缓存策略**: 相同prompt的结果缓存
5. **CDN集成**: R2 + Cloudflare CDN加速访问
