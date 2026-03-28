import { describe, it, expect, vi } from 'vitest';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));

import { createChangelogWriter } from '../export/changelog.js';

describe('changelog', () => {
  function mockCore() {
    const entries: Buffer[] = [];
    return {
      ready: vi.fn().mockResolvedValue(undefined),
      append: vi.fn().mockImplementation((data: Buffer) => {
        entries.push(data);
        return Promise.resolve({ length: entries.length });
      }),
      get length() {
        return entries.length;
      },
      _entries: entries,
    };
  }

  it('writeEvent appends a JSON-encoded changelog event', async () => {
    const core = mockCore();
    const writer = createChangelogWriter(core as any);

    const seq = await writer.writeEvent({
      operation: 'upsert',
      feed: 'cig-entities',
      key: 'entity/person/uuid-1',
      entity_type: 'person',
      entity_id: '00000000-0000-0000-0000-000000000001',
      version: 1,
      source: 'fec-ingest',
      batch_id: '00000000-0000-0000-0000-000000000002',
    });

    expect(seq).toBe(1);
    expect(core.append).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(core._entries[0].toString('utf-8'));
    expect(parsed.operation).toBe('upsert');
    expect(parsed.entity_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(parsed.timestamp).toBeTruthy();
    expect(parsed.seq).toBe(0);
  });

  it('length reflects number of entries', async () => {
    const core = mockCore();
    const writer = createChangelogWriter(core as any);

    expect(writer.length).toBe(0);
    await writer.writeEvent({
      operation: 'upsert',
      feed: 'cig-entities',
      key: 'entity/person/uuid-1',
      entity_type: 'person',
      entity_id: '00000000-0000-0000-0000-000000000001',
      version: 1,
      source: 'test',
      batch_id: '00000000-0000-0000-0000-000000000002',
    });
    expect(writer.length).toBe(1);
  });

  it('start with pool subscribes to LISTEN', async () => {
    const core = mockCore();
    const mockClient = {
      query: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      release: vi.fn(),
    };
    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockClient),
    } as any;

    const writer = createChangelogWriter(core as any, mockPool);
    await writer.start();

    expect(mockPool.connect).toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenCalledWith('LISTEN cig_changes');
    expect(mockClient.on).toHaveBeenCalledWith('notification', expect.any(Function));

    await writer.stop();
    expect(mockClient.release).toHaveBeenCalled();
  });
});
