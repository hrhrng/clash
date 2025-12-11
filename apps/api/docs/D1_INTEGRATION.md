# Cloudflare D1 Integration & LangGraph Checkpointing

This document describes the integration of Cloudflare D1 database and LangGraph checkpoint system in Master Clash.

## Overview

Master Clash uses LangGraph for workflow orchestration with persistent checkpointing to:

- **Resume workflows** after failures or interruptions
- **Track costs and API usage** across video production pipelines
- **Enable time-travel debugging** by inspecting historical states
- **Optimize resource usage** by avoiding re-generation of expensive assets

### Database Choice: SQLite/D1

- **Local Development**: SQLite database stored in `./data/checkpoints.db`
- **Production (Cloudflare)**: Cloudflare D1 (SQLite-compatible serverless database)
- **Compatibility**: Same codebase works for both environments

## Architecture

### Components

```
Master Clash Video Production
├── LangGraph Workflow (workflow/video_production.py)
│   ├── StateGraph with checkpointing
│   ├── Nodes: initialize → screenplay → assets → shots → finalize
│   └── Conditional edges for error handling
│
├── Database Layer (database/)
│   ├── connection.py - Database initialization and connection
│   ├── checkpointer.py - LangGraph SqliteSaver integration
│   └── metadata.py - Cost, timing, and API tracking
│
└── Storage Schema
    ├── LangGraph tables (auto-created by SqliteSaver)
    │   ├── checkpoints - Workflow state snapshots
    │   └── writes - State write operations
    │
    └── Metadata tables (custom)
        ├── workflow_executions - High-level run tracking
        ├── checkpoint_metadata - Step-level metrics
        ├── generated_assets - Asset inventory
        └── api_logs - API call details
```

## Database Schema

### LangGraph Tables (Auto-Created)

These tables are managed automatically by `SqliteSaver`:

- **checkpoints**: Stores serialized workflow state at each step
- **writes**: Stores individual state write operations

### Custom Metadata Tables

#### workflow_executions

Tracks high-level workflow runs:

```sql
CREATE TABLE workflow_executions (
    run_id TEXT PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP,
    total_cost REAL DEFAULT 0.0,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Status values**: `running`, `completed`, `failed`, `completed_with_errors`, `paused`

#### checkpoint_metadata

Tracks metrics for each checkpoint:

```sql
CREATE TABLE checkpoint_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    checkpoint_ns TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    execution_time_ms INTEGER,
    api_calls INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0.0,
    error_message TEXT,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(checkpoint_ns, checkpoint_id)
);
```

**Step names**: `initialization`, `screenplay_generation`, `asset_generation`, `shot_generation`, `finalization`

#### generated_assets

Inventory of all generated assets:

```sql
CREATE TABLE generated_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    checkpoint_id TEXT,
    asset_type TEXT NOT NULL,
    asset_path TEXT NOT NULL,
    asset_url TEXT,
    generation_params JSON,
    cost REAL DEFAULT 0.0,
    duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES workflow_executions(run_id)
);
```

**Asset types**: `screenplay`, `character_image`, `location_image`, `video`, `keyframe`

#### api_logs

Detailed API call logging:

```sql
CREATE TABLE api_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    checkpoint_id TEXT,
    service TEXT NOT NULL,
    endpoint TEXT,
    request_params JSON,
    response_data JSON,
    status_code INTEGER,
    cost REAL DEFAULT 0.0,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES workflow_executions(run_id)
);
```

**Services**: `openai`, `google`, `anthropic`, `kling`, `nano_banana`, `stability`

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Local development (SQLite)
DATABASE_URL=sqlite:///./data/checkpoints.db

# Cloudflare D1 (production)
# DATABASE_URL=d1://your-d1-database-name

# PostgreSQL (alternative)
# DATABASE_URL=postgresql://user:password@localhost:5432/master_clash
```

### Cloudflare D1 Setup (Production)

1. **Create D1 database**:

```bash
npx wrangler d1 create master-clash-checkpoints
```

2. **Get database ID** from output and add to `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "master-clash-checkpoints"
database_id = "your-database-id"
```

3. **Run migrations**:

```bash
# Initialize schema
npx wrangler d1 execute master-clash-checkpoints \
  --file=./src/master_clash/database/schema.sql
```

4. **Update environment**:

```bash
DATABASE_URL=d1://master-clash-checkpoints
```

## Usage

### Initialize Database

```python
from master_clash.database import init_database

# Initialize schema (run once)
init_database()
```

### Run Workflow with Checkpointing

```python
from master_clash.workflow import run_video_production_workflow

# Start new workflow
result = await run_video_production_workflow(
    story_csv_path="stories/my_story.csv",
    thread_id="my-workflow-run-1"
)

# Resume from checkpoint
result = await run_video_production_workflow(
    thread_id="my-workflow-run-1",
    resume=True
)
```

### Track Metadata

```python
from master_clash.database.metadata import MetadataTracker, track_step

tracker = MetadataTracker(run_id="my-run-123")

# Start workflow tracking
tracker.start_workflow("video_production", metadata={"user_id": "abc"})

# Track a step
with track_step(tracker, "ns", "checkpoint-1", "screenplay_generation", 0) as step:
    # Do work
    screenplay = generate_screenplay()

    # Track metrics
    step.add_api_call(cost=0.05)
    step.set_metadata("model", "gpt-4")

# Record assets
tracker.record_asset(
    asset_type="screenplay",
    asset_path="output/screenplay.json",
    cost=0.05,
    duration_ms=5000
)

# Get statistics
stats = tracker.get_workflow_stats()
print(f"Total cost: ${stats['total_cost']}")
print(f"API calls: {stats['api_call_count']}")
```

### Inspect Checkpoints

```python
from master_clash.database import get_checkpointer
from master_clash.database.checkpointer import list_checkpoints

checkpointer = get_checkpointer()

# List all checkpoints for a workflow run
checkpoints = list_checkpoints(checkpointer, thread_id="my-run-123")

for cp in checkpoints:
    print(f"Checkpoint: {cp['checkpoint_id']}")
    print(f"  Parent: {cp['parent_checkpoint_id']}")
    print(f"  Namespace: {cp['checkpoint_ns']}")
    print(f"  Metadata: {cp['metadata']}")
```

### Query Execution History

```python
import sqlite3
from master_clash.database.connection import get_db_connection

conn = get_db_connection()
cursor = conn.cursor()

# Find failed workflows
cursor.execute("""
    SELECT run_id, workflow_name, start_time, total_cost
    FROM workflow_executions
    WHERE status = 'failed'
    ORDER BY start_time DESC
    LIMIT 10
""")

for row in cursor.fetchall():
    print(f"Failed run: {row['run_id']}, Cost: ${row['total_cost']}")

# Find expensive API calls
cursor.execute("""
    SELECT service, endpoint, cost, duration_ms
    FROM api_logs
    WHERE cost > 1.0
    ORDER BY cost DESC
    LIMIT 10
""")

for row in cursor.fetchall():
    print(f"{row['service']}/{row['endpoint']}: ${row['cost']} ({row['duration_ms']}ms)")
```

## Workflow Graph

### Video Production Pipeline

```
┌─────────────┐
│ initialize  │
└──────┬──────┘
       │
       v
┌─────────────────────┐
│ generate_screenplay │
└──────┬──────────────┘
       │
       v (if success)
┌──────────────────┐
│ generate_assets  │
└──────┬───────────┘
       │
       v (if success)
┌──────────────────┐
│ generate_shots   │
└──────┬───────────┘
       │
       v
┌──────────┐
│ finalize │
└──────────┘
```

### State Schema

```python
class VideoProductionState(TypedDict):
    # Input
    story_input: str
    story_csv_path: str | None

    # Outputs
    screenplay: Screenplay | None
    production_design: ProductionDesignDict | None
    shots: list[ShotDict]
    final_video_path: str | None

    # Metadata
    run_id: str
    current_step: str
    total_cost: float
    total_duration_ms: int
    api_call_count: int
    errors: list[str]
    status: str

    # LangChain messages
    messages: list
```

## Benefits

### Cost Optimization

- **Avoid Re-generation**: Checkpoints prevent re-running expensive image/video generation
- **Cost Tracking**: Granular cost tracking per step and API call
- **Budget Control**: Monitor total cost in real-time

Example: If image generation costs $0.10/image and you have 20 characters + 15 locations:
- **Without checkpoints**: Re-run = $3.50 wasted on re-generation
- **With checkpoints**: Resume from last successful step = $0

### Reliability

- **Automatic Recovery**: Resume from last checkpoint after failures
- **Partial Results**: Access intermediate results even if workflow fails
- **Error Isolation**: Identify which step failed and why

### Debugging

- **Time-Travel**: Inspect state at any checkpoint
- **Performance Analysis**: Track execution time per step
- **API Debugging**: Inspect request/response for failed API calls

### Scalability

- **Parallel Execution**: Multiple workflows can run concurrently
- **Resource Management**: Track and limit concurrent expensive operations
- **Audit Trail**: Complete history of all workflow executions

## Best Practices

### 1. Unique Thread IDs

Use meaningful thread IDs for easier tracking:

```python
import datetime

thread_id = f"video-prod-{datetime.datetime.now().isoformat()}-{user_id}"
```

### 2. Checkpoint Naming

Use descriptive checkpoint namespaces:

```python
checkpoint_ns = f"{workflow_name}/{run_id}/{step_name}"
```

### 3. Error Handling

Always record errors in metadata:

```python
try:
    result = expensive_operation()
except Exception as e:
    step.set_error(str(e))
    tracker.record_api_call(
        service="my_service",
        error_message=str(e),
        status_code=500
    )
    raise
```

### 4. Cost Estimation

Track estimated vs actual costs:

```python
step.set_metadata("estimated_cost", 0.10)
step.add_cost(actual_cost)
```

### 5. Database Maintenance

Periodically clean up old checkpoints:

```python
# Delete checkpoints older than 30 days
cursor.execute("""
    DELETE FROM checkpoints
    WHERE created_at < datetime('now', '-30 days')
""")
```

## Troubleshooting

### Database Locked Error

If you encounter "database is locked" errors:

```python
# Use connection with timeout
import sqlite3

conn = sqlite3.connect(db_path, timeout=30.0)
```

### Large State Size

If state becomes too large:

1. Store large data (images, videos) as file paths, not in state
2. Use asset references instead of embedding data
3. Consider compressing JSON metadata

### Checkpoint Recovery

To manually inspect and recover:

```python
from langgraph.checkpoint.sqlite import SqliteSaver

checkpointer = get_checkpointer()
config = {"configurable": {"thread_id": "my-run-123"}}

# Get latest checkpoint
checkpoint = checkpointer.get(config)

# Get state at checkpoint
state = checkpoint.state if checkpoint else None
```

## Migration to D1

When moving from local SQLite to Cloudflare D1:

1. **Export data**:

```bash
sqlite3 data/checkpoints.db .dump > backup.sql
```

2. **Import to D1**:

```bash
npx wrangler d1 execute master-clash-checkpoints --file=backup.sql
```

3. **Update environment**:

```bash
DATABASE_URL=d1://master-clash-checkpoints
```

4. **Test connection**:

```python
from master_clash.database import get_db_connection

conn = get_db_connection()
print("Connected to D1!")
```

## Performance Considerations

### Indexing

All critical queries are indexed:

- `workflow_executions.status`
- `workflow_executions.created_at`
- `checkpoint_metadata(checkpoint_ns, checkpoint_id)`
- `generated_assets.run_id`
- `api_logs.run_id`

### Batch Operations

For bulk inserts, use transactions:

```python
conn = get_db_connection()
cursor = conn.cursor()

cursor.execute("BEGIN TRANSACTION")
for asset in assets:
    cursor.execute("INSERT INTO generated_assets ...", asset)
cursor.execute("COMMIT")
```

### Query Optimization

Use prepared statements and limit results:

```python
cursor.execute("""
    SELECT * FROM api_logs
    WHERE run_id = ?
    ORDER BY created_at DESC
    LIMIT 100
""", (run_id,))
```

## Security

### Sensitive Data

Never store sensitive data in checkpoints or metadata:

- API keys (use environment variables)
- User credentials
- Payment information

### Access Control

For production, implement:

1. **Row-level security** (if supported by D1)
2. **API authentication** for database access
3. **Encryption at rest** (D1 default)

## Monitoring

### Key Metrics to Track

```python
# Total workflow count
SELECT COUNT(*) FROM workflow_executions;

# Success rate
SELECT
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM workflow_executions
GROUP BY status;

# Average cost per workflow
SELECT AVG(total_cost) FROM workflow_executions WHERE status = 'completed';

# Most expensive step
SELECT
    step_name,
    AVG(total_cost) as avg_cost,
    MAX(total_cost) as max_cost
FROM checkpoint_metadata
GROUP BY step_name
ORDER BY avg_cost DESC;

# API performance
SELECT
    service,
    COUNT(*) as calls,
    AVG(duration_ms) as avg_duration,
    SUM(cost) as total_cost
FROM api_logs
GROUP BY service
ORDER BY total_cost DESC;
```

## Resources

- [LangGraph Checkpointing Docs](https://langchain-ai.github.io/langgraph/concepts/persistence/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [LangGraph API Reference](https://langchain-ai.github.io/langgraph/reference/)

## Support

For issues or questions:

- GitHub Issues: [master-clash/issues](https://github.com/yourusername/master-clash/issues)
- Documentation: [docs/](../docs/)
- Examples: [examples/workflow_with_checkpoints.py](../examples/)
