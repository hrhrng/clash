# Cloudflare D1 数据库设置指南

## 📊 数据库架构

我们需要两个D1数据库：

1. **master-clash-frontend** - Frontend数据
   - projects (项目)
   - messages (聊天记录)
   - assets (生成的资源)
   - users, sessions (认证)

2. **master-clash-backend** - Backend数据
   - checkpoints (LangGraph workflow状态)
   - checkpoint_blobs (checkpoint数据)
   - checkpoint_writes (checkpoint写入)

## 🚀 第一步：创建D1数据库

### 1. 安装Wrangler（如果还没有）

```bash
npm install -g wrangler

# 登录Cloudflare
wrangler login
```

### 2. 创建Frontend数据库

```bash
# 创建D1数据库
wrangler d1 create master-clash-frontend

# 输出示例：
# ✅ Successfully created DB 'master-clash-frontend'
#
# [[d1_databases]]
# binding = "DB"
# database_name = "master-clash-frontend"
# database_id = "xxxx-xxxx-xxxx-xxxx"
```

**保存输出的 `database_id`！**

### 3. 创建Backend数据库

```bash
wrangler d1 create master-clash-backend

# 保存这个 database_id
```

## 📝 第二步：配置Frontend

### 1. 更新 `frontend/wrangler.toml`

```toml
name = "master-clash-frontend"
compatibility_date = "2024-01-01"

# D1 Database binding
[[d1_databases]]
binding = "DB"  # 在代码中通过 env.DB 访问
database_name = "master-clash-frontend"
database_id = "your-frontend-database-id"  # 从上面的输出复制
```

### 2. 创建Frontend schema SQL

```bash
cd frontend
```

创建文件 `frontend/drizzle/schema.sql`（从现有migration合并）：

```sql
-- Projects table
CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    nodes TEXT DEFAULT '[]',
    edges TEXT DEFAULT '[]',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Messages table
CREATE TABLE IF NOT EXISTS message (
    id TEXT PRIMARY KEY NOT NULL,
    content TEXT NOT NULL,
    role TEXT NOT NULL,
    project_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);

-- Assets table
CREATE TABLE IF NOT EXISTS asset (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);

-- Auth tables
CREATE TABLE IF NOT EXISTS user (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT,
    email TEXT UNIQUE,
    emailVerified INTEGER,
    image TEXT
);

CREATE TABLE IF NOT EXISTS account (
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT NOT NULL,
    providerAccountId TEXT NOT NULL,
    refresh_token TEXT,
    access_token TEXT,
    expires_at INTEGER,
    token_type TEXT,
    scope TEXT,
    id_token TEXT,
    session_state TEXT,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session (
    sessionToken TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL,
    expires INTEGER NOT NULL,
    FOREIGN KEY (userId) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verificationToken (
    identifier TEXT NOT NULL,
    token TEXT NOT NULL,
    expires INTEGER NOT NULL
);

-- Create indexes
CREATE UNIQUE INDEX IF NOT EXISTS user_email_unique ON user(email);
```

### 3. 执行Frontend migration

```bash
# 本地测试
wrangler d1 execute master-clash-frontend --local --file=drizzle/schema.sql

# 生产环境
wrangler d1 execute master-clash-frontend --remote --file=drizzle/schema.sql
```

## 🔧 第三步：配置Backend

### 1. 更新 `backend/wrangler.toml`

创建文件（如果不存在）：

```toml
name = "master-clash-backend"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "CHECKPOINTS_DB"
database_name = "master-clash-backend"
database_id = "your-backend-database-id"  # 从创建命令输出复制
```

### 2. 创建Backend schema SQL

创建文件 `backend/migrations/d1/0001_checkpoints.sql`：

```sql
-- LangGraph checkpointer schema
CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type TEXT,
    checkpoint BLOB NOT NULL,
    metadata BLOB NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS checkpoint_blobs (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    version TEXT NOT NULL,
    type TEXT NOT NULL,
    blob BLOB,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, channel, version)
);

CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INTEGER NOT NULL,
    channel TEXT NOT NULL,
    type TEXT,
    blob BLOB NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);
```

### 3. 执行Backend migration

```bash
cd backend

# 本地测试
wrangler d1 execute master-clash-backend --local --file=migrations/d1/0001_checkpoints.sql

# 生产环境
wrangler d1 execute master-clash-backend --remote --file=migrations/d1/0001_checkpoints.sql
```

## 🔌 第四步：代码集成

### Frontend - 使用D1

更新 `frontend/lib/db/drizzle.ts`：

```typescript
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

// 开发环境：使用本地SQLite
// 生产环境：使用Cloudflare D1
export function getDb(env?: any) {
  if (process.env.NODE_ENV === 'production' && env?.DB) {
    // Cloudflare D1
    return drizzle(env.DB, { schema });
  } else {
    // 本地SQLite (需要其他配置)
    // ... 现有的本地配置
  }
}
```

### Backend - LangGraph Checkpointer

更新 `backend/src/master_clash/database/d1_checkpointer.py`：

```python
"""
Cloudflare D1 checkpointer for LangGraph.
Stores workflow state in D1 database.
"""
from typing import Any, Optional
from langgraph.checkpoint.base import BaseCheckpointSaver
import httpx
import json

class D1Checkpointer(BaseCheckpointSaver):
    """Checkpointer using Cloudflare D1 via HTTP API."""

    def __init__(
        self,
        account_id: str,
        database_id: str,
        api_token: str,
    ):
        self.account_id = account_id
        self.database_id = database_id
        self.api_token = api_token
        self.base_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query"

    async def _execute(self, sql: str, params: Optional[list] = None):
        """Execute SQL on D1 via HTTP API."""
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

        payload = {
            "sql": sql,
            "params": params or []
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.base_url,
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            return response.json()

    async def aput(self, config, checkpoint, metadata):
        """Save checkpoint to D1."""
        sql = """
        INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, checkpoint, metadata)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(thread_id, checkpoint_ns, checkpoint_id) DO UPDATE SET
            checkpoint = excluded.checkpoint,
            metadata = excluded.metadata
        """

        await self._execute(sql, [
            config["configurable"]["thread_id"],
            config["configurable"].get("checkpoint_ns", ""),
            checkpoint["id"],
            json.dumps(checkpoint),
            json.dumps(metadata)
        ])

    async def aget(self, config):
        """Load checkpoint from D1."""
        # Implementation for loading checkpoint
        pass
```

更新 `backend/src/master_clash/config.py`：

```python
# 添加D1配置
class Settings(BaseSettings):
    # ... 现有配置 ...

    # Cloudflare D1 for LangGraph checkpointer
    cloudflare_account_id: str | None = Field(
        default=None,
        description="Cloudflare account ID"
    )

    cloudflare_d1_database_id: str | None = Field(
        default=None,
        description="D1 database ID for checkpoints"
    )

    cloudflare_api_token: str | None = Field(
        default=None,
        description="Cloudflare API token with D1 edit permissions"
    )
```

## 🔑 第五步：环境变量配置

### Frontend `.env`

```bash
# Cloudflare D1 (生产环境)
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=your-frontend-database-id
CLOUDFLARE_API_TOKEN=your-api-token

# 开发环境继续使用本地SQLite
DATABASE_URL="file:./local.db"
```

### Backend `.env`

```bash
# Cloudflare D1 for LangGraph checkpointer
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=your-backend-database-id
CLOUDFLARE_API_TOKEN=your-api-token

# 或者使用PostgreSQL（备选）
# DATABASE_URL=postgresql://user:pass@host/db
```

## 📊 第六步：获取API Token

1. 进入Cloudflare Dashboard
2. 点击右上角头像 → "My Profile"
3. 左侧菜单 → "API Tokens"
4. "Create Token" → "Create Custom Token"

配置权限：
- **Account** → D1 → Edit
- **Account Resources** → Include → Your Account

保存生成的token！

## 🧪 第七步：测试连接

### 测试Frontend D1

```bash
cd frontend

# 查看表结构
wrangler d1 execute master-clash-frontend --remote --command "SELECT name FROM sqlite_master WHERE type='table'"

# 查看数据
wrangler d1 execute master-clash-frontend --remote --command "SELECT * FROM project LIMIT 5"
```

### 测试Backend D1

```bash
cd backend

# 查看checkpoints表
wrangler d1 execute master-clash-backend --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```

## 🚀 第八步：部署

### Frontend部署到Cloudflare Pages

```bash
cd frontend

# 构建
npm run pages:build

# 部署
wrangler pages deploy .vercel/output/static --project-name=master-clash

# 或者连接到Git自动部署
wrangler pages project create master-clash
```

### Backend部署到Cloudflare Workers

```bash
cd backend

# 部署
wrangler deploy
```

## 📝 常用命令

```bash
# 查看所有D1数据库
wrangler d1 list

# 查看数据库信息
wrangler d1 info master-clash-frontend

# 执行SQL（本地）
wrangler d1 execute master-clash-frontend --local --command "SELECT * FROM project"

# 执行SQL（远程）
wrangler d1 execute master-clash-frontend --remote --command "SELECT * FROM project"

# 导出数据
wrangler d1 export master-clash-frontend --output=backup.sql

# 删除数据库（小心！）
wrangler d1 delete master-clash-frontend
```

## 🔄 开发工作流

1. **本地开发**: 使用 `local.db` (SQLite)
2. **测试**: 使用 `wrangler d1 --local`
3. **生产**: 使用远程D1

## 💡 最佳实践

1. **Migration管理**: 使用Drizzle Kit生成migrations，然后执行到D1
2. **备份**: 定期使用 `wrangler d1 export` 备份
3. **索引**: 为常用查询添加索引
4. **监控**: 在Cloudflare Dashboard查看D1使用情况

## ⚠️ D1限制（免费层）

- 每个账户最多10个数据库
- 每个数据库最大500MB
- 每天最多50,000次读取
- 每天最多100,000次写入

生产环境建议升级到付费计划。

## 🆘 故障排查

**Error: D1 binding not found**
- 检查 `wrangler.toml` 配置
- 确认 `database_id` 正确

**Error: unauthorized**
- 检查API token权限
- 确认token包含D1 Edit权限

**Migration失败**
- 检查SQL语法（D1使用SQLite语法）
- 逐条执行SQL调试

需要帮助？查看 [Cloudflare D1 文档](https://developers.cloudflare.com/d1/)
