/**
 * Change log diff generation service (T076).
 * Compares two snapshots by entity ID, detects new/updated/removed records.
 */

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import type { SnapshotFile } from './snapshot.js';

export interface ChangelogEntry {
  entity_id: string;
  entity_type: string;
  change_type: 'added' | 'updated' | 'removed';
  table: string;
}

export interface ChangelogSummary {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  entries: ChangelogEntry[];
}

/**
 * Parse a JSONL.gz buffer into a map of id → content hash.
 */
export function parseSnapshotFile(data: Buffer): Map<string, string> {
  const decompressed = gunzipSync(data).toString('utf-8');
  const map = new Map<string, string>();

  for (const line of decompressed.split('\n')) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as Record<string, unknown>;
    const id = record.id as string;
    if (!id) continue;
    const hash = createHash('sha256').update(line).digest('hex');
    map.set(id, hash);
  }

  return map;
}

/**
 * Compute a diff between previous and current snapshot files for a single table.
 */
export function diffTable(
  prevData: Buffer | null,
  currData: Buffer,
  table: string,
  entityType: string,
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const currMap = parseSnapshotFile(currData);
  const prevMap = prevData ? parseSnapshotFile(prevData) : new Map<string, string>();

  // Find added and updated
  for (const [id, hash] of currMap) {
    const prevHash = prevMap.get(id);
    if (!prevHash) {
      entries.push({ entity_id: id, entity_type: entityType, change_type: 'added', table });
    } else if (prevHash !== hash) {
      entries.push({ entity_id: id, entity_type: entityType, change_type: 'updated', table });
    }
  }

  // Find removed
  for (const id of prevMap.keys()) {
    if (!currMap.has(id)) {
      entries.push({ entity_id: id, entity_type: entityType, change_type: 'removed', table });
    }
  }

  return entries;
}

/**
 * Generate a full changelog comparing two snapshots.
 */
export function generateChangelog(
  prevFiles: SnapshotFile[] | null,
  currFiles: SnapshotFile[],
): ChangelogSummary {
  const allEntries: ChangelogEntry[] = [];

  for (const currFile of currFiles) {
    const prevFile = prevFiles?.find((f) => f.table === currFile.table) ?? null;
    const entries = diffTable(
      prevFile?.data ?? null,
      currFile.data,
      currFile.table,
      currFile.table,
    );
    allEntries.push(...entries);
  }

  const added = allEntries.filter((e) => e.change_type === 'added').length;
  const updated = allEntries.filter((e) => e.change_type === 'updated').length;
  const removed = allEntries.filter((e) => e.change_type === 'removed').length;

  // Count unchanged: total current records minus added and updated
  const totalCurr = currFiles.reduce((sum, f) => sum + f.recordCount, 0);
  const unchanged = totalCurr - added - updated;

  return { added, updated, removed, unchanged, entries: allEntries };
}
