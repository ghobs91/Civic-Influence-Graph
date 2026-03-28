import { describe, it, expect, vi } from 'vitest';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));

import { replicateEntities, replicateRelationships } from '../sync/replication.js';

describe('replication', () => {
  function mockBee(data: Record<string, unknown> = {}) {
    return {
      get: vi.fn().mockImplementation((key: string) => {
        if (data[key]) return Promise.resolve({ key, value: data[key] });
        return Promise.resolve(null);
      }),
      put: vi.fn().mockResolvedValue(undefined),
      createReadStream: vi.fn().mockImplementation(() => {
        // Return async iterator
        const entries = Object.entries(data).map(([key, value]) => ({ key, value }));
        return {
          [Symbol.asyncIterator]() {
            let i = 0;
            return {
              next() {
                if (i < entries.length) return Promise.resolve({ value: entries[i++], done: false });
                return Promise.resolve({ value: undefined, done: true });
              },
            };
          },
        };
      }),
    } as any;
  }

  it('full mode replicates all entities', async () => {
    const remote = mockBee({
      'entity/person/1': { id: '1', name: 'Jane' },
      'entity/committee/2': { id: '2', name: 'PAC' },
    });
    const local = mockBee();

    const result = await replicateEntities(remote, local, { mode: 'full' });
    expect(result.mode).toBe('full');
    expect(result.entitiesReplicated).toBe(2);
  });

  it('entity-set mode replicates specific entities', async () => {
    const remote = mockBee({
      'entity/person/uuid-1': { id: 'uuid-1', name: 'Jane' },
    });
    const local = mockBee();

    const result = await replicateEntities(remote, local, {
      mode: 'entity-set',
      entityIds: ['uuid-1'],
    });
    expect(result.entitiesReplicated).toBe(1);
  });

  it('snapshot-only mode does nothing', async () => {
    const remote = mockBee();
    const local = mockBee();

    const result = await replicateEntities(remote, local, { mode: 'snapshot-only' });
    expect(result.entitiesReplicated).toBe(0);
  });

  it('replicateRelationships returns 0 for snapshot-only', async () => {
    const remote = mockBee();
    const local = mockBee();

    const count = await replicateRelationships(remote, local, { mode: 'snapshot-only' });
    expect(count).toBe(0);
  });
});
