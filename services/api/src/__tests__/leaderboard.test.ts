import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerLeaderboardRoute, type LeaderboardDeps } from '../routes/leaderboard.js';

function makeMockPool(queryHandler: (text: string, params?: unknown[]) => { rows: unknown[] }) {
  return {
    query: vi.fn((text: string, params?: unknown[]) => Promise.resolve(queryHandler(text, params))),
  } as unknown as LeaderboardDeps['pool'];
}

describe('GET /api/v1/leaderboard', () => {
  it('returns top donors with default params', async () => {
    const pool = makeMockPool(() => ({
      rows: [
        { entity_id: 'e1', entity_type: 'committee', total_amount: '5000000', donation_count: '1200', name: 'AIPAC PAC', committee_type: 'pac' },
        { entity_id: 'e2', entity_type: 'committee', total_amount: '3000000', donation_count: '800', name: 'EMILY\'s List', committee_type: 'super_pac' },
      ],
    }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/api/v1/leaderboard' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.entries).toHaveLength(2);
    expect(body.data.entries[0].name).toBe('AIPAC PAC');
    expect(body.data.entries[0].total_amount).toBe(5000000);
    expect(body.data.entries[0].donation_count).toBe(1200);
    expect(body.meta.page).toBe(1);

    // Verify is_memo filtering is in the query
    const queryText = pool.query.mock.calls[0][0] as string;
    expect(queryText).toContain('is_memo = false');

    await server.close();
  });

  it('applies date range filters', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?start_date=2024-01-01&end_date=2024-12-31',
    });
    expect(res.statusCode).toBe(200);

    const queryText = pool.query.mock.calls[0][0] as string;
    expect(queryText).toContain('transaction_date >=');
    expect(queryText).toContain('transaction_date <=');
    const queryParams = pool.query.mock.calls[0][1] as unknown[];
    expect(queryParams).toContain('2024-01-01');
    expect(queryParams).toContain('2024-12-31');

    await server.close();
  });

  it('applies election_cycle filter', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?election_cycle=2024',
    });
    expect(res.statusCode).toBe(200);

    const queryText = pool.query.mock.calls[0][0] as string;
    expect(queryText).toContain('election_cycle =');
    const queryParams = pool.query.mock.calls[0][1] as unknown[];
    expect(queryParams).toContain('2024');

    await server.close();
  });

  it('applies entity_type filter', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?entity_type=committee',
    });
    expect(res.statusCode).toBe(200);

    const queryText = pool.query.mock.calls[0][0] as string;
    expect(queryText).toContain('source_entity_type =');
    const queryParams = pool.query.mock.calls[0][1] as unknown[];
    expect(queryParams).toContain('committee');

    await server.close();
  });

  it('applies committee_type filter', async () => {
    const pool = makeMockPool(() => ({
      rows: [
        { entity_id: 'e1', entity_type: 'committee', total_amount: '1000000', donation_count: '100', name: 'Test PAC', committee_type: 'super_pac' },
      ],
    }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?committee_type=super_pac',
    });
    expect(res.statusCode).toBe(200);

    const queryText = pool.query.mock.calls[0][0] as string;
    expect(queryText).toContain('committee_type =');
    const queryParams = pool.query.mock.calls[0][1] as unknown[];
    expect(queryParams).toContain('super_pac');

    await server.close();
  });

  it('respects limit parameter', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?limit=10',
    });
    expect(res.statusCode).toBe(200);

    const queryParams = pool.query.mock.calls[0][1] as unknown[];
    expect(queryParams).toContain(10);

    await server.close();
  });

  it('returns 400 for invalid date format', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?start_date=not-a-date',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');

    await server.close();
  });

  it('returns 400 for limit exceeding max', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?limit=200',
    });
    expect(res.statusCode).toBe(400);

    await server.close();
  });

  it('returns 400 for invalid entity_type', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/leaderboard?entity_type=invalid',
    });
    expect(res.statusCode).toBe(400);

    await server.close();
  });

  it('handles person entities with null committee_type', async () => {
    const pool = makeMockPool(() => ({
      rows: [
        { entity_id: 'p1', entity_type: 'person', total_amount: '250000', donation_count: '50', name: 'John Doe', committee_type: null },
      ],
    }));

    const server = Fastify();
    registerLeaderboardRoute(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/api/v1/leaderboard' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.entries[0].committee_type).toBeNull();
    expect(body.data.entries[0].entity_type).toBe('person');

    await server.close();
  });
});
