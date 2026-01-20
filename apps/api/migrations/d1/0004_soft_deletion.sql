-- Migration 0004: Soft deletion for sessions
-- Add is_deleted and deleted_at columns to session_interrupts

ALTER TABLE session_interrupts ADD COLUMN is_deleted INTEGER DEFAULT 0;
ALTER TABLE session_interrupts ADD COLUMN deleted_at TIMESTAMP;

-- Create index for filtering deleted sessions
CREATE INDEX IF NOT EXISTS idx_session_deleted ON session_interrupts(is_deleted, project_id);
