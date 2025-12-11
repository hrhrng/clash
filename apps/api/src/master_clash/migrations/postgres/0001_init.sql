-- Schema for PostgreSQL (Neon)

CREATE TABLE IF NOT EXISTS workflow_executions (
    run_id TEXT PRIMARY KEY,
    workflow_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    start_time TIMESTAMPTZ DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    total_cost DOUBLE PRECISION DEFAULT 0.0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkpoint_metadata (
    id SERIAL PRIMARY KEY,
    checkpoint_ns TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    execution_time_ms INTEGER,
    api_calls INTEGER DEFAULT 0,
    total_cost DOUBLE PRECISION DEFAULT 0.0,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_checkpoint UNIQUE (checkpoint_ns, checkpoint_id)
);

CREATE TABLE IF NOT EXISTS generated_assets (
    id SERIAL PRIMARY KEY,
    run_id TEXT NOT NULL,
    checkpoint_id TEXT,
    asset_type TEXT NOT NULL,
    asset_path TEXT NOT NULL,
    asset_url TEXT,
    generation_params JSONB,
    cost DOUBLE PRECISION DEFAULT 0.0,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_assets_run FOREIGN KEY (run_id) REFERENCES workflow_executions(run_id)
);

CREATE TABLE IF NOT EXISTS api_logs (
    id SERIAL PRIMARY KEY,
    run_id TEXT NOT NULL,
    checkpoint_id TEXT,
    service TEXT NOT NULL,
    endpoint TEXT,
    request_params JSONB,
    response_data JSONB,
    status_code INTEGER,
    cost DOUBLE PRECISION DEFAULT 0.0,
    duration_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_logs_run FOREIGN KEY (run_id) REFERENCES workflow_executions(run_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
    ON workflow_executions(status);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_created
    ON workflow_executions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_checkpoint_metadata_ns_id
    ON checkpoint_metadata(checkpoint_ns, checkpoint_id);

CREATE INDEX IF NOT EXISTS idx_generated_assets_run_id
    ON generated_assets(run_id);

CREATE INDEX IF NOT EXISTS idx_api_logs_run_id
    ON api_logs(run_id);

