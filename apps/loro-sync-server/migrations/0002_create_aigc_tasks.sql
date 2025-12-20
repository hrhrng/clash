-- Create AIGC tasks table for managing async generation tasks
CREATE TABLE IF NOT EXISTS aigc_tasks (
  task_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_type TEXT NOT NULL, -- 'kling_video', 'nano_banana', etc.
  status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'

  -- External API task tracking
  external_task_id TEXT,
  external_service TEXT, -- 'kling', 'gemini', etc.

  -- Task parameters (stored as JSON)
  params TEXT NOT NULL,

  -- Results
  result_url TEXT,
  result_data TEXT, -- JSON with additional result metadata
  error_message TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER,

  -- Retry tracking
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_aigc_tasks_project_id
ON aigc_tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_aigc_tasks_status
ON aigc_tasks(status);

CREATE INDEX IF NOT EXISTS idx_aigc_tasks_external
ON aigc_tasks(external_service, external_task_id);

-- Index for polling pending tasks
CREATE INDEX IF NOT EXISTS idx_aigc_tasks_pending
ON aigc_tasks(status, updated_at)
WHERE status IN ('pending', 'processing');
