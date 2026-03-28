import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));
vi.mock('hyperswarm', () => ({ default: vi.fn() }));

vi.mock('../feeds.js', () => {
  const core = {
    ready: vi.fn().mockResolvedValue(undefined),
    key: Buffer.alloc(32, 0xaa),
  };
  return {
    initFeeds: vi.fn().mockResolvedValue({
      store: { get: vi.fn().mockReturnValue(core) },
      entities: { core: { key: Buffer.alloc(32), length: 100 } },
      relationships: { core: { key: Buffer.alloc(32), length: 50 } },
      changelog: { key: Buffer.alloc(32), length: 10 },
      snapshots: { core: { key: Buffer.alloc(32), length: 5 } },
    }),
    getFeedInfos: vi.fn().mockResolvedValue([
      { name: 'cig-entities', publicKey: 'aa'.repeat(32), length: 100, writable: true },
    ]),
    closeFeeds: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../sync/discovery.js', () => ({
  createDiscovery: vi.fn().mockReturnValue({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    peerCount: 3,
    isActive: true,
  }),
}));

import { startAdminServer } from '../admin-server.js';

function request(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path, headers: { 'content-type': 'application/json' } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({ status: res.statusCode!, data: raw ? JSON.parse(raw) : {} });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

// Use a random high port to avoid conflicts in parallel test runs.
const TEST_PORT = 19000 + Math.floor(Math.random() * 1000);

describe('admin-server', () => {
  beforeAll(async () => {
    // Prevent the process.on(SIGINT/SIGTERM) handlers from interfering with tests
    vi.spyOn(process, 'on').mockImplementation(() => process);
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
    await startAdminServer('/tmp/test-p2p-data', TEST_PORT);
    // Give the server time to bind
    await new Promise((r) => setTimeout(r, 200));
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('GET /feeds returns feed list', async () => {
    const { status, data } = await request(TEST_PORT, 'GET', '/feeds');
    expect(status).toBe(200);
    expect(data.feeds).toBeInstanceOf(Array);
    const feeds = data.feeds as Array<{ name: string; peers: number }>;
    expect(feeds[0].name).toBe('cig-entities');
    expect(feeds[0].peers).toBe(3);
  });

  it('POST /feeds/:name/seed starts seeding', async () => {
    const { status, data } = await request(TEST_PORT, 'POST', '/feeds/cig-entities/seed', { action: 'start' });
    expect(status).toBe(200);
    expect(data.seeding).toBe(true);
  });

  it('POST /feeds/:name/seed stops seeding', async () => {
    const { status, data } = await request(TEST_PORT, 'POST', '/feeds/cig-entities/seed', { action: 'stop' });
    expect(status).toBe(200);
    expect(data.seeding).toBe(false);
  });

  it('POST /feeds/follow validates public key format', async () => {
    const { status, data } = await request(TEST_PORT, 'POST', '/feeds/follow', { public_key: 'not-hex' });
    expect(status).toBe(400);
    expect(data.error).toMatch(/64 hex/);
  });

  it('POST /feeds/follow accepts valid public key', async () => {
    const { status, data } = await request(TEST_PORT, 'POST', '/feeds/follow', { public_key: 'aa'.repeat(32) });
    expect(status).toBe(201);
    expect(data.name).toBeDefined();
  });

  it('returns 404 for unknown routes', async () => {
    const { status } = await request(TEST_PORT, 'GET', '/unknown');
    expect(status).toBe(404);
  });
});
