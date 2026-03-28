/**
 * Snapshot generation service (T075).
 * Queries all entities/relationships from PostgreSQL, produces JSONL.gz files
 * with a manifest containing record counts, checksums, data sources, and election cycles.
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type pg from 'pg';

export interface SnapshotManifest {
  id: string;
  version: string;
  created_at: string;
  election_cycles: string[];
  data_sources: string[];
  record_counts: Record<string, number>;
  files: Array<{
    path: string;
    table: string;
    record_count: number;
    checksum_sha256: string;
    size_bytes: number;
  }>;
  total_records: number;
  total_size_bytes: number;
}

export interface SnapshotFile {
  path: string;
  table: string;
  data: Buffer;
  recordCount: number;
  checksum: string;
}

export interface SnapshotOptions {
  dataSources?: string[];
  electionCycles?: string[];
}

const ENTITY_TABLES = ['person', 'committee', 'organization', 'bill', 'sector'] as const;
const RELATIONSHIP_TABLES = ['donation', 'lobbying_engagement', 'vote', 'affiliation'] as const;

/**
 * Generate a complete snapshot of all entity and relationship data.
 */
export async function generateSnapshot(
  pool: pg.Pool,
  opts: SnapshotOptions = {},
): Promise<{ manifest: SnapshotManifest; files: SnapshotFile[] }> {
  const files: SnapshotFile[] = [];
  const recordCounts: Record<string, number> = {};

  // Export entity tables
  for (const table of ENTITY_TABLES) {
    const file = await exportTable(pool, table, `entities/${table}.jsonl.gz`);
    files.push(file);
    recordCounts[table] = file.recordCount;
  }

  // Export relationship tables
  for (const table of RELATIONSHIP_TABLES) {
    const file = await exportTable(pool, table, `relationships/${table}.jsonl.gz`);
    files.push(file);
    recordCounts[table] = file.recordCount;
  }

  const totalRecords = files.reduce((sum, f) => sum + f.recordCount, 0);
  const totalSize = files.reduce((sum, f) => sum + f.data.length, 0);

  const manifest: SnapshotManifest = {
    id: createHash('sha256')
      .update(new Date().toISOString())
      .digest('hex')
      .slice(0, 16),
    version: '1.0',
    created_at: new Date().toISOString(),
    election_cycles: opts.electionCycles ?? ['2024', '2026'],
    data_sources: opts.dataSources ?? ['fec'],
    record_counts: recordCounts,
    files: files.map((f) => ({
      path: f.path,
      table: f.table,
      record_count: f.recordCount,
      checksum_sha256: f.checksum,
      size_bytes: f.data.length,
    })),
    total_records: totalRecords,
    total_size_bytes: totalSize,
  };

  return { manifest, files };
}

/**
 * Export a single table to JSONL.gz format.
 */
export async function exportTable(
  pool: pg.Pool,
  table: string,
  path: string,
): Promise<SnapshotFile> {
  // Use a safe allowlist of table names to prevent SQL injection
  const allowedTables = new Set([...ENTITY_TABLES, ...RELATIONSHIP_TABLES]);
  if (!allowedTables.has(table as typeof ENTITY_TABLES[number])) {
    throw new Error(`Unknown table: ${table}`);
  }

  const result = await pool.query(`SELECT row_to_json(t) AS data FROM ${table} t`);
  const lines: string[] = [];

  for (const row of result.rows) {
    lines.push(JSON.stringify(row.data));
  }

  const jsonl = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  const compressed = gzipSync(Buffer.from(jsonl, 'utf-8'));
  const checksum = createHash('sha256').update(compressed).digest('hex');

  return {
    path,
    table,
    data: compressed,
    recordCount: lines.length,
    checksum,
  };
}
