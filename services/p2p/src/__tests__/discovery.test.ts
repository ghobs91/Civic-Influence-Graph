import { describe, it, expect, vi } from 'vitest';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));
vi.mock('hyperswarm', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      join: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      destroy: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

import { createDiscovery } from '../sync/discovery.js';

describe('discovery', () => {
  function mockFeedSet() {
    const core = {
      ready: vi.fn().mockResolvedValue(undefined),
      key: Buffer.alloc(32, 0xaa),
    };
    return {
      store: { replicate: vi.fn() },
      entities: { core },
      relationships: { core },
      changelog: core,
      snapshots: { core },
    } as any;
  }

  it('starts and becomes active', async () => {
    const feedSet = mockFeedSet();
    const dm = createDiscovery(feedSet);
    expect(dm.isActive).toBe(false);
    await dm.start();
    expect(dm.isActive).toBe(true);
  });

  it('stop deactivates', async () => {
    const feedSet = mockFeedSet();
    const dm = createDiscovery(feedSet);
    await dm.start();
    await dm.stop();
    expect(dm.isActive).toBe(false);
  });

  it('tracks peer count starting at 0', async () => {
    const feedSet = mockFeedSet();
    const dm = createDiscovery(feedSet);
    expect(dm.peerCount).toBe(0);
  });

  it('start is idempotent', async () => {
    const feedSet = mockFeedSet();
    const dm = createDiscovery(feedSet);
    await dm.start();
    await dm.start();
    expect(dm.isActive).toBe(true);
  });
});
