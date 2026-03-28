/**
 * Hypercore changelog feed writer (T059).
 * Subscribes to PostgreSQL LISTEN/NOTIFY change notifications and writes
 * JSON change events to the append-only cig-changelog Hypercore.
 */

import type pg from 'pg';
import { createChangelogEvent, type ChangelogEvent, type ChangelogOperation } from '@cig/p2p-protocol';

export interface ChangelogWriter {
  start(): Promise<void>;
  stop(): Promise<void>;
  writeEvent(opts: Omit<ChangelogEvent, 'seq' | 'timestamp'>): Promise<number>;
  readonly length: number;
}

interface HypercoreAppendable {
  append(data: Buffer | string): Promise<{ length: number }>;
  length: number;
  ready(): Promise<void>;
}

/**
 * Create a changelog writer that appends events to a Hypercore feed
 * and optionally listens for PostgreSQL NOTIFY events.
 */
export function createChangelogWriter(
  core: HypercoreAppendable,
  pool?: pg.Pool,
): ChangelogWriter {
  let pgClient: pg.PoolClient | null = null;
  let listening = false;

  async function start(): Promise<void> {
    await core.ready();
    if (!pool) return;

    pgClient = await pool.connect();
    await pgClient.query('LISTEN cig_changes');
    listening = true;

    pgClient.on('notification', (msg) => {
      if (msg.channel !== 'cig_changes' || !msg.payload) return;
      try {
        const payload = JSON.parse(msg.payload) as {
          operation: ChangelogOperation;
          feed: string;
          key: string;
          entity_type: string;
          entity_id: string;
          version: number;
          source: string;
          batch_id: string;
        };
        writeEvent(payload).catch(() => {
          // Best-effort: log failures but don't crash
        });
      } catch {
        // Invalid JSON payload — skip
      }
    });
  }

  async function stop(): Promise<void> {
    listening = false;
    if (pgClient) {
      await pgClient.query('UNLISTEN cig_changes').catch(() => {});
      pgClient.release();
      pgClient = null;
    }
  }

  async function writeEvent(opts: Omit<ChangelogEvent, 'seq' | 'timestamp'>): Promise<number> {
    const event = createChangelogEvent({
      ...opts,
      seq: core.length,
    });
    const encoded = Buffer.from(JSON.stringify(event), 'utf-8');
    const result = await core.append(encoded);
    return result.length;
  }

  return {
    start,
    stop,
    writeEvent,
    get length() {
      return core.length;
    },
  };
}
