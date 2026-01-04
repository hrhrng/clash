-- Migration 0002: Session management tables and enhanced history
-- This table tracks session status, project association, and metadata for history/interrupts

CREATE TABLE IF NOT EXISTS session_interrupts (
    thread_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    title TEXT,
    summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    interrupted_at TIMESTAMP
);

-- Note: In SQLite/D1, we can't do ADD COLUMN IF NOT EXISTS easily without logic.
-- We'll rely on the app to handle incremental schema changes if the table exists.
-- But for a clean start or first run of this migration, the CREATE TABLE above is enough.

-- Index for project listing
CREATE INDEX IF NOT EXISTS idx_session_project ON session_interrupts(project_id, updated_at DESC);
