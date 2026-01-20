-- Schema for AIGC Tasks and Assets (PostgreSQL)

-- AIGC Tasks table for async task management
CREATE TABLE IF NOT EXISTS aigc_tasks (
    task_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    provider TEXT,
    status TEXT NOT NULL,
    params JSONB,
    result_url TEXT,
    result_data JSONB,
    error_message TEXT,
    worker_id TEXT,
    heartbeat_at BIGINT,
    lease_expires_at BIGINT,
    created_at BIGINT,
    updated_at BIGINT,
    completed_at BIGINT,
    max_retries INTEGER DEFAULT 3,
    external_task_id TEXT,
    external_service TEXT
);

CREATE INDEX IF NOT EXISTS idx_aigc_tasks_status ON aigc_tasks(status);
CREATE INDEX IF NOT EXISTS idx_aigc_tasks_project ON aigc_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_aigc_tasks_worker ON aigc_tasks(worker_id);

-- Asset table for Semantic ID system
CREATE TABLE IF NOT EXISTS asset (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_project ON asset(project_id);
