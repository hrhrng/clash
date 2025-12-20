-- Create Loro snapshots table
CREATE TABLE IF NOT EXISTS loro_snapshots (
  project_id TEXT PRIMARY KEY,
  snapshot BLOB NOT NULL,
  version TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Create index for faster lookups by update time
CREATE INDEX IF NOT EXISTS idx_loro_snapshots_updated_at
ON loro_snapshots(updated_at);
