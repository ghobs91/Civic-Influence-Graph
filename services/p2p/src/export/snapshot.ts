/**
 * Hyperdrive snapshot exporter (T060).
 * Generates JSONL.gz files for all entity/relationship tables
 * plus manifest.json with checksums and record counts.
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type pg from 'pg';
import { snapshotPaths, type SnapshotManifest } from '@cig/p2p-protocol';

export interface SnapshotExportStats {
  recordCounts: Record<string, number>;
  totalRecords: number;
  manifestPath: string;
}

interface DriveWriter {
  put(path: string, data: Buffer | string): Promise<void>;
  ready(): Promise<void>;
  core: { key: Buffer };
}

const ENTITY_QUERIES: Record<string, string> = {
  persons: 'SELECT row_to_json(t) FROM person t',
  committees: 'SELECT row_to_json(t) FROM committee t',
  organizations: 'SELECT row_to_json(t) FROM organization t',
  bills: 'SELECT row_to_json(t) FROM bill t',
  sectors: 'SELECT row_to_json(t) FROM sector t',
};

const RELATIONSHIP_QUERIES: Record<string, string> = {
  donations: 'SELECT row_to_json(t) FROM donation t',
  lobbying: 'SELECT row_to_json(t) FROM lobbying_engagement t',
  votes: 'SELECT row_to_json(t) FROM vote t',
  affiliations: 'SELECT row_to_json(t) FROM affiliation t',
};

/**
 * Export a full snapshot to a Hyperdrive.
 */
export async function exportSnapshot(
  pool: pg.Pool,
  drive: DriveWriter,
  opts: {
    dataSources: string[];
    electionCycles: string[];
    prevSnapshotSeq: number;
    currentSeq: number;
  },
  onProgress?: (table: string, count: number) => void,
): Promise<SnapshotExportStats> {
  await drive.ready();

  const recordCounts: Record<string, number> = {};
  let totalRecords = 0;
  const allData: Buffer[] = [];

  // Export entities
  for (const [name, query] of Object.entries(ENTITY_QUERIES)) {
    const path = snapshotPaths.entities[name as keyof typeof snapshotPaths.entities];
    const count = await exportTable(pool, drive, query, path);
    recordCounts[name] = count;
    totalRecords += count;
    onProgress?.(name, count);
  }

  // Export relationships
  for (const [name, query] of Object.entries(RELATIONSHIP_QUERIES)) {
    const path = snapshotPaths.relationships[name as keyof typeof snapshotPaths.relationships];
    const count = await exportTable(pool, drive, query, path);
    recordCounts[name] = count;
    totalRecords += count;
    onProgress?.(name, count);
  }

  // Build manifest
  const manifest: SnapshotManifest = {
    version: '1.0.0',
    created_at: new Date().toISOString(),
    node_public_key: drive.core.key.toString('hex'),
    record_counts: recordCounts,
    data_sources: opts.dataSources,
    election_cycles: opts.electionCycles,
    prev_snapshot_seq: opts.prevSnapshotSeq,
    current_seq: opts.currentSeq,
    checksum_sha256: computeChecksum(recordCounts),
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  await drive.put(snapshotPaths.manifest, Buffer.from(manifestJson, 'utf-8'));

  return {
    recordCounts,
    totalRecords,
    manifestPath: snapshotPaths.manifest,
  };
}

/**
 * Export a single table to a JSONL.gz file in the Hyperdrive.
 */
async function exportTable(
  pool: pg.Pool,
  drive: DriveWriter,
  query: string,
  path: string,
): Promise<number> {
  const result = await pool.query<{ row_to_json: unknown }>(query);
  const lines: string[] = [];

  for (const row of result.rows) {
    lines.push(JSON.stringify(row.row_to_json));
  }

  const jsonl = lines.join('\n') + (lines.length > 0 ? '\n' : '');
  const compressed = gzipSync(Buffer.from(jsonl, 'utf-8'));
  await drive.put(path, compressed);

  return result.rows.length;
}

/**
 * Compute a SHA-256 checksum of the record counts for integrity verification.
 */
function computeChecksum(recordCounts: Record<string, number>): string {
  const sorted = Object.entries(recordCounts).sort(([a], [b]) => a.localeCompare(b));
  const data = JSON.stringify(sorted);
  return createHash('sha256').update(data).digest('hex');
}
