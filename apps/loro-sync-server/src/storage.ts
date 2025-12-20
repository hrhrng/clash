import type { Env, SnapshotData } from './types';
import type { LoroDoc } from 'loro-crdt';

/**
 * Load Loro snapshot from D1 database
 */
/**
 * Load Loro snapshot from D1 database
 */
export async function loadSnapshot(
  db: D1Database,
  projectId: string
): Promise<Uint8Array | null> {
  try {
    // Try loading chunks first
    const chunks = await db
      .prepare(
        'SELECT chunk_data FROM loro_snapshot_chunks WHERE project_id = ? ORDER BY chunk_index ASC'
      )
      .bind(projectId)
      .all<{ chunk_data: number[] }>();

    if (chunks.results && chunks.results.length > 0) {
      // Reassemble chunks
      const totalLength = chunks.results.reduce((acc, chunk) => acc + chunk.chunk_data.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks.results) {
        const chunkData = new Uint8Array(chunk.chunk_data);
        result.set(chunkData, offset);
        offset += chunkData.length;
      }
      return result;
    }

    // Fallback to legacy single-blob storage
    const result = await db
      .prepare('SELECT snapshot FROM loro_snapshots WHERE project_id = ?')
      .bind(projectId)
      .first<{ snapshot: ArrayBuffer }>();

    if (!result?.snapshot) {
      return null;
    }

    return new Uint8Array(result.snapshot);
  } catch (error) {
    console.error(`Failed to load snapshot for project ${projectId}:`, error);
    return null;
  }
}

/**
 * Save Loro snapshot to D1 database
 */
export async function saveSnapshot(
  db: D1Database,
  projectId: string,
  snapshot: Uint8Array,
  version: string
): Promise<void> {
  try {
    const CHUNK_SIZE = 500 * 1024; // 500KB chunks to stay well under 1MB limit
    const totalChunks = Math.ceil(snapshot.length / CHUNK_SIZE);

    // 1. Save metadata to main table (with empty snapshot blob to save space/avoid limit)
    await db
      .prepare(
        `INSERT OR REPLACE INTO loro_snapshots
         (project_id, snapshot, version, updated_at)
         VALUES (?, ?, ?, ?)`
      )
      .bind(projectId, new Uint8Array(0), version, Date.now())
      .run();

    // 2. Prepare statements for atomic execution
    const statements = [];

    // Delete existing chunks first
    statements.push(
      db.prepare('DELETE FROM loro_snapshot_chunks WHERE project_id = ?').bind(projectId)
    );

    // Add insert statements for new chunks
    if (totalChunks > 0) {
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, snapshot.length);
        const chunk = snapshot.slice(start, end);
        
        statements.push(
          db.prepare(
            `INSERT INTO loro_snapshot_chunks (project_id, chunk_index, chunk_data)
             VALUES (?, ?, ?)`
          ).bind(projectId, i, chunk)
        );
      }
    }
      
    // Execute all in a single batch transaction
    await db.batch(statements);

    console.log(`Saved snapshot for project ${projectId}, version: ${version} (${totalChunks} chunks)`);
  } catch (error) {
    console.error(`Failed to save snapshot for project ${projectId}:`, error);
    throw error;
  }
}

/**
 * Initialize database schema if needed
 * This should be run via migrations, but keeping it here for reference
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS loro_snapshots (
  project_id TEXT PRIMARY KEY,
  snapshot BLOB NOT NULL,
  version TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_loro_snapshots_updated_at
ON loro_snapshots(updated_at);
`;
