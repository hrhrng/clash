# 快速设置指南

## 📦 新架构说明

**关键改进**: Python后端只负责AI生成，前端负责存储和数据库！

```
Python Backend → 返回 base64/URL
    ↓
Next.js API → 上传到 R2
    ↓
Frontend → 写入数据库 + 创建节点
```

## ⚡ 快速开始

### 1. 安装依赖

```bash
# Backend
cd backend
uv sync

# Frontend
cd frontend
npm install
```

### 2. 配置Backend (只需AI API keys)

```bash
cd backend
cp .env.example .env
nano .env
```

**必填项**:
```bash
GOOGLE_API_KEY=your-google-api-key        # Gemini图片生成
KLING_ACCESS_KEY=your-kling-access-key    # Kling视频生成
KLING_SECRET_KEY=your-kling-secret-key
```

### 3. 配置Frontend (需要R2)

```bash
cd frontend
cp .env.example .env
nano .env
```

**必填项**:
```bash
# R2 Object Storage
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key-id
R2_SECRET_ACCESS_KEY=your-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

### 4. 设置R2（参考原R2_SETUP_GUIDE.md）

1. 创建R2 bucket
2. 启用public access
3. 生成API token
4. 将credentials添加到`frontend/.env`

### 5. 启动服务

```bash
# Terminal 1: Backend
cd backend
uv run python -m master_clash.api.main

# Terminal 2: Frontend
cd frontend
npm run dev
```

## 🎯 测试流程

1. 访问 http://localhost:3000
2. 创建或打开项目
3. 添加Text Node（输入prompt）
4. 添加Image Gen Node（Action Badge）
5. 连接Text → Image Gen
6. 点击Play按钮
7. 等待10-30秒，新的Image Node会出现！

## 📂 文件说明

### Backend修改
- ✅ `backend/src/master_clash/api/main.py` - 简化API，只返回base64/URL
- ❌ 移除了R2和数据库相关代码

### Frontend新增
- ✅ `frontend/lib/r2-upload.ts` - R2上传工具
- ✅ `frontend/app/api/upload/image/route.ts` - 图片上传API
- ✅ `frontend/app/api/upload/video/route.ts` - 视频上传API
- ✅ `frontend/app/components/nodes/ActionBadge.tsx` - 新执行逻辑

## 🔧 故障排查

### Backend问题

**Error: Image generation failed**
- 检查 `GOOGLE_API_KEY` 是否正确
- 确认Google AI API有配额

**Error: Video generation failed**
- 检查 `KLING_ACCESS_KEY` 和 `KLING_SECRET_KEY`
- 确认Kling API有余额

### Frontend问题

**Error: Failed to upload to R2**
- 检查 `frontend/.env` 中R2配置
- 确认R2 bucket启用了public access
- 查看Next.js console的详细错误

**Database errors**
- 确认 `frontend/local.db` 存在
- 运行migration: `cd frontend && npx drizzle-kit push`

**CORS errors**
- 确认backend运行在 `http://localhost:8000`
- 检查backend的CORS配置

## 📊 架构对比

### 旧架构（复杂）
```
Frontend → Python Backend
              ↓
          生成 + 上传R2 + 写数据库
              ↓
          返回asset ID
              ↓
         Frontend显示
```
**问题**: Backend做太多事，前后端数据库耦合

### 新架构（简洁）
```
Frontend → Python Backend (只生成)
              ↓
          返回 base64/URL
              ↓
         Frontend上传R2
              ↓
         Frontend写数据库
              ↓
         创建节点显示
```
**优势**: 职责清晰，易于维护和扩展

## 🎨 优势总结

| 方面 | 旧架构 | 新架构 |
|------|--------|--------|
| Backend职责 | 生成+存储+数据库 | 只生成 |
| 数据库耦合 | Backend访问Frontend DB | 完全解耦 |
| 错误处理 | 复杂，难以重试 | 分步骤，易重试 |
| 部署复杂度 | Backend需配置R2+DB | Backend无状态 |
| 扩展性 | 困难 | 容易 |

## 📖 详细文档

- **架构详解**: 查看 `ARCHITECTURE.md`
- **R2设置**: 查看 `R2_SETUP_GUIDE.md`
- **API文档**: Backend自带Swagger UI (`http://localhost:8000/docs`)

祝使用愉快！🚀
