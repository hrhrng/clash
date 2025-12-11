# 快速上手：Checkpoint 功能

## 5 分钟快速入门

### 1. 安装依赖（如果还没有）

```bash
uv sync
```

### 2. 初始化数据库

```bash
uv run python scripts/init_database.py
```

你应该看到：
```
✓ Database initialized successfully!
```

### 3. 配置环境变量

在 `.env` 文件中添加：

```bash
DATABASE_URL=sqlite:///./data/checkpoints.db
```

### 4. 运行示例

```bash
uv run python examples/workflow_with_checkpoints.py
```

## 基本用法

### 启动一个新的工作流

```python
from master_clash.workflow import run_video_production_workflow

# 异步运行
result = await run_video_production_workflow(
    story_csv_path="stories/my_story.csv",
    thread_id="my-workflow-001"
)

print(f"Status: {result['status']}")
print(f"Cost: ${result['total_cost']:.2f}")
```

### 从 Checkpoint 恢复

如果工作流失败或中断：

```python
# 使用相同的 thread_id 恢复
result = await run_video_production_workflow(
    thread_id="my-workflow-001",
    resume=True
)
```

### 追踪成本和性能

```python
from master_clash.database.metadata import MetadataTracker

tracker = MetadataTracker(run_id="my-workflow-001")

# 获取统计信息
stats = tracker.get_workflow_stats()

print(f"Total cost: ${stats['total_cost']:.2f}")
print(f"API calls: {stats['api_call_count']}")
print(f"Duration: {stats['total_api_duration_ms'] / 1000:.1f}s")
print(f"Assets generated: {sum(stats['assets_by_type'].values())}")
```

## 查看 Checkpoint 历史

```python
from master_clash.database.checkpointer import list_checkpoints, get_checkpointer

checkpointer = get_checkpointer()
checkpoints = list_checkpoints(checkpointer, thread_id="my-workflow-001")

for cp in checkpoints:
    print(f"Checkpoint: {cp['checkpoint_id']}")
    print(f"  Metadata: {cp['metadata']}")
```

## 数据库查询示例

### 查看所有工作流

```python
import sqlite3
from master_clash.database.connection import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

cursor.execute("""
    SELECT run_id, workflow_name, status, total_cost, start_time
    FROM workflow_executions
    ORDER BY start_time DESC
    LIMIT 10
""")

for row in cursor.fetchall():
    print(f"{row[0]}: {row[1]} - {row[2]} (${row[3]:.2f})")
```

### 查看成本最高的 API 调用

```python
cursor.execute("""
    SELECT service, endpoint, cost, duration_ms, created_at
    FROM api_logs
    WHERE cost > 0
    ORDER BY cost DESC
    LIMIT 10
""")

for row in cursor.fetchall():
    print(f"{row[0]}/{row[1]}: ${row[2]:.2f} ({row[3]}ms)")
```

### 查看生成的资产

```python
cursor.execute("""
    SELECT asset_type, asset_path, cost, created_at
    FROM generated_assets
    WHERE run_id = ?
    ORDER BY created_at
""", ("my-workflow-001",))

for row in cursor.fetchall():
    print(f"{row[0]}: {row[1]} (${row[2]:.2f})")
```

## 工作流步骤

Master Clash 工作流包含以下步骤：

1. **initialization** - 初始化状态
2. **screenplay_generation** - 生成剧本（使用 GPT-4/Gemini）
3. **asset_generation** - 生成角色和场景图片（并行）
4. **shot_generation** - 生成视频片段（Kling AI）
5. **finalization** - 完成和清理

每个步骤都会：
- ✅ 自动保存 checkpoint
- 📊 记录成本和时间
- 🔍 捕获错误和元数据

## 错误处理

工作流会自动处理错误：

```python
result = await run_video_production_workflow(
    story_csv_path="story.csv",
    thread_id="run-123"
)

if result['status'] == 'failed':
    print(f"Errors: {result['errors']}")

    # 修复问题后恢复
    result = await run_video_production_workflow(
        thread_id="run-123",
        resume=True
    )
```

## 最佳实践

### 1. 使用有意义的 Thread ID

```python
import datetime

thread_id = f"video-{datetime.datetime.now():%Y%m%d-%H%M%S}"
```

### 2. 监控成本

```python
stats = tracker.get_workflow_stats()
if stats['total_cost'] > 10.0:
    print("⚠️ Cost threshold exceeded!")
```

### 3. 定期清理旧 Checkpoint

```python
# 删除 30 天前的 checkpoint
cursor.execute("""
    DELETE FROM checkpoints
    WHERE created_at < datetime('now', '-30 days')
""")
```

### 4. 使用上下文管理器追踪步骤

```python
from master_clash.database.metadata import track_step

with track_step(tracker, "ns", "cp-1", "custom_step", 0) as step:
    # 执行操作
    result = my_expensive_operation()

    # 记录指标
    step.add_api_call(cost=0.10)
    step.set_metadata("model", "gpt-4")
```

## 生产环境部署

### Cloudflare D1

1. 创建 D1 数据库：
   ```bash
   npx wrangler d1 create master-clash-prod
   ```

2. 更新 `.env`：
   ```bash
   DATABASE_URL=d1://master-clash-prod
   ```

3. 运行迁移：
   ```bash
   uv run python scripts/init_database.py
   ```

## 故障排除

### 数据库锁定错误

如果遇到 "database is locked"：

```python
# 在 connection.py 中增加超时
conn = sqlite3.connect(db_path, timeout=30.0)
```

### Checkpoint 过大

如果状态太大：
- 不要在状态中存储图片/视频数据
- 只存储文件路径和 URL
- 使用 `generated_assets` 表记录资产

### 找不到 Checkpoint

检查 thread_id 是否正确：

```python
checkpoints = list_checkpoints(checkpointer, thread_id="your-thread-id")
if not checkpoints:
    print("No checkpoints found - starting fresh")
```

## 更多资源

- 📖 [完整文档](docs/D1_INTEGRATION.md)
- 💡 [示例代码](examples/workflow_with_checkpoints.py)
- 🏗️ [工作流架构](src/master_clash/workflow/)
- 🗄️ [数据库模块](src/master_clash/database/)

## 下一步

1. ✅ 初始化数据库
2. ✅ 运行示例工作流
3. 🔄 尝试从 checkpoint 恢复
4. 📊 查看成本统计
5. 🚀 创建自己的工作流

祝你使用愉快！🎬
