-- Session interrupt flags for graceful session management
-- Stores interrupt requests that can be checked across serverless instances

CREATE TABLE IF NOT EXISTS session_interrupts (
    thread_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',  -- running, completing, interrupted, completed
    interrupted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_session_interrupts_project
    ON session_interrupts(project_id);

CREATE INDEX IF NOT EXISTS idx_session_interrupts_status
    ON session_interrupts(status);
