import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerReplicationRoutes, type ReplicationDeps, type FeedStatus } from '../routes/replication.js';

function buildApp(deps: ReplicationDeps) {
  const app = Fastify({ logger: false });
  registerReplicationRoutes(app, deps);
  return app;
}

describe('replication routes', () => {
  let deps: ReplicationDeps;

  beforeEach(() => {
    deps = {
      getFeedStatuses: vi.fn<[], Promise<FeedStatus[]>>().mockResolvedValue([
        {
          name: 'cig-entities',
          publicKey: 'aa'.repeat(32),
          length: 1000,
          seeding: true,
          peers: 3,
          bytesUploaded: 42000000,
          lastSync: '2026-03-25T18:00:00Z',
        },
      ]),
      startSeeding: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
      stopSeeding: vi.fn<[string], Promise<void>>().mockResolvedValue(undefined),
      followFeed: vi.fn<[string], Promise<{ name: string }>>().mockResolvedValue({ name: 'remote-1' }),
    };
  });

  it('GET /replication/feeds returns feed list', async () => {
    const app = buildApp(deps);
    const res = await app.inject({ method: 'GET', url: '/api/v1/replication/feeds' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.feeds).toHaveLength(1);
    expect(body.data.feeds[0].name).toBe('cig-entities');
  });

  it('POST /replication/feeds/:name/seed starts seeding', async () => {
    const app = buildApp(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/replication/feeds/cig-entities/seed',
      payload: { action: 'start' },
    });
    expect(res.statusCode).toBe(200);
    expect(deps.startSeeding).toHaveBeenCalledWith('cig-entities');
    expect(res.json().data.seeding).toBe(true);
  });

  it('POST /replication/feeds/:name/seed stops seeding', async () => {
    const app = buildApp(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/replication/feeds/cig-entities/seed',
      payload: { action: 'stop' },
    });
    expect(res.statusCode).toBe(200);
    expect(deps.stopSeeding).toHaveBeenCalledWith('cig-entities');
    expect(res.json().data.seeding).toBe(false);
  });

  it('POST /replication/feeds/:name/seed rejects unknown feed', async () => {
    const app = buildApp(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/replication/feeds/bogus/seed',
      payload: { action: 'start' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_FEED');
  });

  it('POST /replication/feeds/follow creates follow', async () => {
    const app = buildApp(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/replication/feeds/follow',
      payload: { public_key: 'ab'.repeat(32) },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.following).toBe(true);
    expect(deps.followFeed).toHaveBeenCalledWith('ab'.repeat(32));
  });

  it('POST /replication/feeds/follow rejects missing key', async () => {
    const app = buildApp(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/replication/feeds/follow',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('MISSING_KEY');
  });

  it('POST /replication/feeds/follow rejects invalid hex key', async () => {
    const app = buildApp(deps);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/replication/feeds/follow',
      payload: { public_key: 'not-a-valid-hex' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_KEY');
  });
});
