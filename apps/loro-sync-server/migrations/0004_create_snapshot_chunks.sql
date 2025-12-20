-- Create table for storing large snapshots in chunks
CREATE TABLE IF NOT EXISTS loro_snapshot_chunks (
  project_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_data BLOB NOT NULL,
  PRIMARY KEY (project_id, chunk_index),
  FOREIGN KEY (project_id) REFERENCES loro_snapshots(project_id) ON DELETE CASCADE
);
