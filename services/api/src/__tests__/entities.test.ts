import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerEntityRoutes, type EntityDeps } from '../routes/entities.js';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeMockPool(queryHandler: (text: string, params?: unknown[]) => { rows: unknown[] }) {
  return {
    query: vi.fn((text: string, params?: unknown[]) => Promise.resolve(queryHandler(text, params))),
  } as unknown as EntityDeps['pool'];
}

describe('GET /api/v1/entities/:id', () => {
  it('should return a person entity', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('FROM person')) {
        return {
          rows: [{
            id: VALID_UUID,
            entity_type: 'legislator',
            canonical_name: 'Nancy Pelosi',
            source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
            name_variants: ['PELOSI, NANCY'],
            party: 'D',
            jurisdictions: ['federal', 'CA'],
            roles: [],
            committee_memberships: [],
            employer: null,
            occupation: null,
            merge_history: [],
          }],
        };
      }
      return { rows: [] };
    });

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: `/api/v1/entities/${VALID_UUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.canonical_name).toBe('Nancy Pelosi');
    expect(body.data.party).toBe('D');
  });

  it('should return a committee entity when person not found', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('FROM committee')) {
        return {
          rows: [{
            id: VALID_UUID,
            source_ids: [],
            name: 'ACTBLUE',
            name_variants: [],
            committee_type: 'pac',
            designation: null,
            jurisdiction: 'federal',
            treasurer: 'John Doe',
            associated_candidate_id: null,
            filing_frequency: 'Q',
            active_from: null,
            active_to: null,
          }],
        };
      }
      return { rows: [] };
    });

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: `/api/v1/entities/${VALID_UUID}` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.entity_type).toBe('committee');
    expect(body.data.canonical_name).toBe('ACTBLUE');
  });

  it('should return 404 when entity not found', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: `/api/v1/entities/${VALID_UUID}` });
    expect(res.statusCode).toBe(404);
  });

  it('should return 400 for invalid UUID', async () => {
    const pool = makeMockPool(() => ({ rows: [] }));

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: '/api/v1/entities/not-a-uuid' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/entities/:id/donations', () => {
  it('should return paginated donations', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('COUNT(*)')) {
        return { rows: [{ total: '2' }] };
      }
      return {
        rows: [
          { id: VALID_UUID, amount: 2800, transaction_date: '2025-10-15', transaction_type: 'direct_contribution' },
          { id: VALID_UUID, amount: 1000, transaction_date: '2025-09-01', transaction_type: 'direct_contribution' },
        ],
      };
    });

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: `/api/v1/entities/${VALID_UUID}/donations` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.donations).toHaveLength(2);
    expect(body.meta.total_count).toBe(2);
  });

  it('should apply direction filter', async () => {
    const pool = makeMockPool(() => ({ rows: [{ total: '0' }] }));

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    await server.inject({
      method: 'GET',
      url: `/api/v1/entities/${VALID_UUID}/donations?direction=received`,
    });

    const firstCall = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstCall[0]).toContain('destination_entity_id');
  });
});

describe('GET /api/v1/entities/:id/lobbying', () => {
  it('should return paginated lobbying engagements', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('COUNT(*)')) {
        return { rows: [{ total: '1' }] };
      }
      return { rows: [{ id: VALID_UUID, filing_type: 'report', amount: 50000 }] };
    });

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: `/api/v1/entities/${VALID_UUID}/lobbying` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.lobbying_engagements).toHaveLength(1);
  });
});

describe('GET /api/v1/entities/:id/votes', () => {
  it('should return paginated votes', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('COUNT(*)')) {
        return { rows: [{ total: '1' }] };
      }
      return { rows: [{ id: VALID_UUID, vote_cast: 'yea', vote_date: '2026-02-15' }] };
    });

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: `/api/v1/entities/${VALID_UUID}/votes` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.votes).toHaveLength(1);
  });
});

describe('GET /api/v1/entities/:id/dashboard', () => {
  it('should return dashboard aggregation', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('SUM(d.amount)') && text.includes('destination_entity_id')) {
        return { rows: [{ total: '150000' }] };
      }
      if (text.includes('SUM(d.amount)') && text.includes('source_entity_id')) {
        return { rows: [{ total: '0' }] };
      }
      if (text.includes('GROUP BY')) {
        return { rows: [{ entity_id: VALID_UUID, entity_type: 'person', amount: '50000', count: '3' }] };
      }
      if (text.includes('total_votes')) {
        return { rows: [{ total_votes: '342', yea_votes: '310', nay_votes: '32' }] };
      }
      if (text.includes('recent')) {
        return { rows: [{ bill_id: VALID_UUID, bill_number: 'H.R.1234', vote_cast: 'yea', vote_date: '2026-02-15' }] };
      }
      return { rows: [] };
    });

    const server = Fastify();
    registerEntityRoutes(server, { pool });
    await server.ready();

    const res = await server.inject({ method: 'GET', url: `/api/v1/entities/${VALID_UUID}/dashboard` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.funding_summary.total_received).toBe(150000);
    expect(body.data.voting_summary.total_votes).toBe(342);
  });
});
