import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createReplicationAdapter, createNoopReplication } from '../services/replication-adapter.js';

describe('createReplicationAdapter', () => {
  const BASE_URL = 'http://localhost:3002';
  let adapter: ReturnType<typeof createReplicationAdapter>;

  beforeEach(() => {
    adapter = createReplicationAdapter(BASE_URL);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getFeedStatuses calls GET /feeds and returns feeds', async () => {
    const feeds = [{ name: 'cig-entities', publicKey: 'aa'.repeat(32), length: 10, seeding: true, peers: 2, bytesUploaded: 0, lastSync: null }];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ feeds }), { status: 200 }));

    const result = await adapter.getFeedStatuses();

    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/feeds`);
    expect(result).toEqual(feeds);
  });

  it('getFeedStatuses returns [] on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));

    const result = await adapter.getFeedStatuses();

    expect(result).toEqual([]);
  });

  it('startSeeding calls POST /feeds/:name/seed with start action', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await adapter.startSeeding('cig-entities');

    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/feeds/cig-entities/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    });
  });

  it('stopSeeding calls POST /feeds/:name/seed with stop action', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await adapter.stopSeeding('cig-entities');

    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/feeds/cig-entities/seed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'stop' }),
    });
  });

  it('startSeeding encodes feed names with special characters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await adapter.startSeeding('feed/with spaces');

    expect(fetch).toHaveBeenCalledWith(
      `${BASE_URL}/feeds/feed%2Fwith%20spaces/seed`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('followFeed calls POST /feeds/follow and returns name', async () => {
    const pubKey = 'aa'.repeat(32);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ name: 'remote-1' }), { status: 201 }),
    );

    const result = await adapter.followFeed(pubKey);

    expect(fetch).toHaveBeenCalledWith(`${BASE_URL}/feeds/follow`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ public_key: pubKey }),
    });
    expect(result).toEqual({ name: 'remote-1' });
  });

  it('followFeed throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad key' }), { status: 400 }),
    );

    await expect(adapter.followFeed('bad')).rejects.toThrow('bad key');
  });
});

describe('createNoopReplication', () => {
  it('getFeedStatuses returns empty array', async () => {
    const noop = createNoopReplication();
    expect(await noop.getFeedStatuses()).toEqual([]);
  });

  it('startSeeding and stopSeeding are no-ops', async () => {
    const noop = createNoopReplication();
    await expect(noop.startSeeding('x')).resolves.toBeUndefined();
    await expect(noop.stopSeeding('x')).resolves.toBeUndefined();
  });

  it('followFeed throws with descriptive message', async () => {
    const noop = createNoopReplication();
    await expect(noop.followFeed('abc')).rejects.toThrow('P2P node not configured');
  });
});
