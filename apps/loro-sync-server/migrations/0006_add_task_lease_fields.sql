-- Add heartbeat/lease fields for orphan task prevention
ALTER TABLE aigc_tasks ADD COLUMN heartbeat_at INTEGER;
ALTER TABLE aigc_tasks ADD COLUMN lease_expires_at INTEGER;
ALTER TABLE aigc_tasks ADD COLUMN worker_id TEXT;
ALTER TABLE aigc_tasks ADD COLUMN provider TEXT DEFAULT 'kling';

-- Index for finding orphan tasks
CREATE INDEX IF NOT EXISTS idx_aigc_tasks_lease
ON aigc_tasks(status, lease_expires_at)
WHERE status = 'processing';
