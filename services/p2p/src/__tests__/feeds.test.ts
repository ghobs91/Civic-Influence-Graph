import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';

// Mock the P2P modules since they aren't available in test env
vi.mock('corestore', () => {
  const mockCore = {
    ready: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    key: Buffer.alloc(32, 0xab),
    length: 42,
    writable: true,
  };
  return {
    default: vi.fn().mockImplementation(() => ({
      ready: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockReturnValue(mockCore),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('hyperbee', () => {
  return {
    default: vi.fn().mockImplementation((core: unknown) => ({
      ready: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      core,
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
    })),
  };
});

vi.mock('hyperdrive', () => {
  const mockCore = {
    ready: vi.fn().mockResolvedValue(undefined),
    key: Buffer.alloc(32, 0xcd),
    length: 10,
    writable: true,
  };
  return {
    default: vi.fn().mockImplementation(() => ({
      ready: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      core: mockCore,
    })),
  };
});

import { initFeeds, getFeeds, getFeedInfos, closeFeeds } from '../feeds.js';

describe('feeds', () => {
  afterEach(async () => {
    await closeFeeds();
  });

  it('initFeeds returns a FeedSet with all four feeds', async () => {
    const fs = await initFeeds('/tmp/test-corestore');
    expect(fs.store).toBeDefined();
    expect(fs.entities).toBeDefined();
    expect(fs.relationships).toBeDefined();
    expect(fs.changelog).toBeDefined();
    expect(fs.snapshots).toBeDefined();
  });

  it('initFeeds returns same instance on second call', async () => {
    const fs1 = await initFeeds('/tmp/test-corestore');
    const fs2 = await initFeeds('/tmp/test-corestore');
    expect(fs1).toBe(fs2);
  });

  it('getFeeds throws if not initialized', () => {
    expect(() => getFeeds()).toThrow('Feeds not initialized');
  });

  it('getFeeds returns the FeedSet after init', async () => {
    await initFeeds('/tmp/test-corestore');
    const fs = getFeeds();
    expect(fs.entities).toBeDefined();
  });

  it('getFeedInfos returns info for all 4 feeds', async () => {
    await initFeeds('/tmp/test-corestore');
    const infos = await getFeedInfos();
    expect(infos).toHaveLength(4);
    expect(infos[0].name).toBe('cig-entities');
    expect(infos[1].name).toBe('cig-relationships');
    expect(infos[2].name).toBe('cig-changelog');
    expect(infos[3].name).toBe('cig-snapshots');
    for (const info of infos) {
      expect(info.publicKey).toBeTruthy();
      expect(typeof info.length).toBe('number');
      expect(typeof info.writable).toBe('boolean');
    }
  });

  it('closeFeeds cleans up and allows re-init', async () => {
    await initFeeds('/tmp/test-corestore');
    await closeFeeds();
    expect(() => getFeeds()).toThrow('Feeds not initialized');
    // Can re-init
    const fs = await initFeeds('/tmp/test-corestore-2');
    expect(fs.entities).toBeDefined();
  });
});
