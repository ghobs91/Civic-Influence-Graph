/**
 * Live sync (T064).
 * Subscribes to remote cig-changelog feed and applies incremental changes
 * to local PostgreSQL/AGE/OpenSearch.
 */

import type pg from 'pg';
import type Hyperbee from 'hyperbee';
import { ChangelogEventSchema, type ChangelogEvent } from '@cig/p2p-protocol';

export interface LiveSyncManager {
  start(): Promise<void>;
  stop(): void;
  readonly cursor: number;
  readonly eventsProcessed: number;
  readonly isRunning: boolean;
}

interface ReadableCore {
  get(seq: number): Promise<Buffer | null>;
  length: number;
  ready(): Promise<void>;
  on(event: string, fn: (...args: unknown[]) => void): void;
  removeListener(event: string, fn: (...args: unknown[]) => void): void;
}

/**
 * Create a live sync manager that tails a remote changelog Hypercore
 * and applies changes to local PostgreSQL.
 */
export function createLiveSync(
  remoteChangelog: ReadableCore,
  remoteEntities: Hyperbee,
  remoteRelationships: Hyperbee,
  pool: pg.Pool,
): LiveSyncManager {
  let running = false;
  let cursor = 0;
  let eventsProcessed = 0;

  function onAppend() {
    if (running) processNew().catch(() => {});
  }

  async function start(): Promise<void> {
    if (running) return;
    running = true;
    await remoteChangelog.ready();

    // Process any events we missed
    await processNew();

    // Listen for new appends
    remoteChangelog.on('append', onAppend);
  }

  function stop(): void {
    running = false;
    remoteChangelog.removeListener('append', onAppend);
  }

  async function processNew(): Promise<void> {
    while (running && cursor < remoteChangelog.length) {
      const buf = await remoteChangelog.get(cursor);
      if (!buf) {
        cursor++;
        continue;
      }

      const raw = JSON.parse(buf.toString('utf-8'));
      const event = ChangelogEventSchema.parse(raw);
      await applyChange(event);
      cursor++;
      eventsProcessed++;
    }
  }

  async function applyChange(event: ChangelogEvent): Promise<void> {
    const { operation, feed, key } = event;

    if (operation === 'delete') {
      await deleteRecord(pool, event);
      return;
    }

    // For upsert/merge/split, fetch the current data from the appropriate Hyperbee
    const bee = feed.includes('entities') ? remoteEntities : remoteRelationships;
    const entry = await bee.get(key);

    if (!entry) return; // Key was deleted before we could read it

    const data = JSON.stringify(entry.value);
    await pool.query(
      `INSERT INTO import_staging (id, table_name, data, imported_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = $3::jsonb, imported_at = NOW()`,
      [event.entity_id, event.entity_type, data],
    );
  }

  async function deleteRecord(pool: pg.Pool, event: ChangelogEvent): Promise<void> {
    // Mark as deleted in staging for downstream processing
    await pool.query(
      `INSERT INTO import_staging (id, table_name, data, imported_at)
       VALUES ($1, $2, '{"_deleted": true}'::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET data = '{"_deleted": true}'::jsonb, imported_at = NOW()`,
      [event.entity_id, event.entity_type],
    );
  }

  return {
    start,
    stop,
    get cursor() {
      return cursor;
    },
    get eventsProcessed() {
      return eventsProcessed;
    },
    get isRunning() {
      return running;
    },
  };
}
