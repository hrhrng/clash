-- Add project ownership for authorization
-- `project` is created by the frontend migrations; for local `wrangler d1 --local`
-- we might start from an empty DB, so create a minimal placeholder table to allow
-- the ownership migration to apply cleanly.
CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY
);
ALTER TABLE project ADD COLUMN owner_id TEXT;
CREATE INDEX IF NOT EXISTS idx_project_owner_id ON project(owner_id);
