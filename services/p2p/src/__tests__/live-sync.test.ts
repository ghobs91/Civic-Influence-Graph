import { describe, it, expect, vi } from 'vitest';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));

import { createLiveSync } from '../sync/live-sync.js';

describe('live-sync', () => {
  function mockChangelog(events: Record<string, unknown>[]) {
    const bufs = events.map((e) => Buffer.from(JSON.stringify(e), 'utf-8'));
    return {
      ready: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation((seq: number) => {
        return Promise.resolve(bufs[seq] ?? null);
      }),
      get length() {
        return bufs.length;
      },
      on: vi.fn(),
      removeListener: vi.fn(),
    } as any;
  }

  it('processes existing events on start', async () => {
    const changelog = mockChangelog([
      {
        seq: 0,
        timestamp: '2026-01-01T00:00:00Z',
        operation: 'upsert',
        feed: 'cig-entities',
        key: 'entity/person/p1',
        entity_type: 'person',
        entity_id: '00000000-0000-0000-0000-000000000001',
        version: 1,
        source: 'test',
        batch_id: '00000000-0000-0000-0000-000000000002',
      },
    ]);

    const mockBee = {
      get: vi.fn().mockResolvedValue({ key: 'entity/person/p1', value: { id: 'p1' } }),
    } as any;

    const mockPool = {
      query: vi.fn().mockResolvedValue(undefined),
    } as any;

    const sync = createLiveSync(changelog, mockBee, mockBee, mockPool);
    await sync.start();

    expect(sync.eventsProcessed).toBe(1);
    expect(sync.cursor).toBe(1);
    expect(mockPool.query).toHaveBeenCalled();
    expect(sync.isRunning).toBe(true);

    sync.stop();
    expect(sync.isRunning).toBe(false);
  });

  it('handles delete operations', async () => {
    const changelog = mockChangelog([
      {
        seq: 0,
        timestamp: '2026-01-01T00:00:00Z',
        operation: 'delete',
        feed: 'cig-entities',
        key: 'entity/person/p1',
        entity_type: 'person',
        entity_id: '00000000-0000-0000-0000-000000000001',
        version: 1,
        source: 'test',
        batch_id: '00000000-0000-0000-0000-000000000002',
      },
    ]);

    const mockBee = { get: vi.fn() } as any;
    const mockPool = { query: vi.fn().mockResolvedValue(undefined) } as any;

    const sync = createLiveSync(changelog, mockBee, mockBee, mockPool);
    await sync.start();

    expect(sync.eventsProcessed).toBe(1);
    // Should insert with _deleted flag
    const callArgs = mockPool.query.mock.calls[0];
    expect(callArgs[0]).toContain('_deleted');

    sync.stop();
  });

  it('starts in not-running state', () => {
    const changelog = mockChangelog([]);
    const mockBee = { get: vi.fn() } as any;
    const mockPool = { query: vi.fn() } as any;

    const sync = createLiveSync(changelog, mockBee, mockBee, mockPool);
    expect(sync.isRunning).toBe(false);
    expect(sync.cursor).toBe(0);
    expect(sync.eventsProcessed).toBe(0);
  });
});
