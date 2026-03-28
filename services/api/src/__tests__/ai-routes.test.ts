import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerAIRoutes } from '../routes/ai.js';

function mockPool() {
  return { query: vi.fn() } as any;
}

function buildApp(pool: any) {
  const app = Fastify({ logger: false });
  registerAIRoutes(app, { pool });
  return app;
}

describe('AI Audit Log Routes', () => {
  let pool: ReturnType<typeof mockPool>;

  beforeEach(() => {
    pool = mockPool();
  });

  // ============================================================
  // GET /ai/audit-log
  // ============================================================

  it('GET /ai/audit-log returns paginated entries', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: 2 }] }) // count
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            timestamp: '2025-06-01T00:00:00Z',
            natural_language_query: 'Who donated?',
            generated_query: 'MATCH ...',
            query_params: {},
            model_id: 'phi-3',
            model_version: '0.2.82',
            result_count: 10,
            client_info: null,
          },
        ],
      });

    const app = buildApp(pool);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ai/audit-log?page=1&page_size=20',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.entries).toHaveLength(1);
    expect(body.data.entries[0].natural_language_query).toBe('Who donated?');
    expect(body.meta.total_count).toBe(2);
  });

  it('GET /ai/audit-log applies date filters', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp(pool);
    await app.inject({
      method: 'GET',
      url: '/api/v1/ai/audit-log?start_date=2025-01-01&end_date=2025-12-31',
    });

    // Count query should include WHERE with date params
    const countCall = pool.query.mock.calls[0];
    expect(countCall[0]).toMatch(/WHERE/);
    expect(countCall[1]).toContain('2025-01-01');
    expect(countCall[1]).toContain('2025-12-31');
  });

  it('GET /ai/audit-log with no params uses defaults', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp(pool);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/ai/audit-log',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.entries).toHaveLength(0);
    expect(body.meta.page).toBe(1);
    expect(body.meta.page_size).toBe(20);
  });

  // ============================================================
  // POST /ai/audit-log
  // ============================================================

  it('POST /ai/audit-log saves entry and returns 201', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'new-uuid', timestamp: '2025-06-01T00:00:00Z' }],
    });

    const app = buildApp(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/audit-log',
      payload: {
        natural_language_query: 'Who donated the most?',
        generated_query: 'MATCH (d)-[don:DONATED_TO]->(c) RETURN d',
        model_id: 'phi-3-mini-q4f16',
        model_version: '0.2.82',
        result_count: 15,
        query_params: { min_amount: 1000 },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.id).toBe('new-uuid');
    expect(body.data.saved_at).toBeDefined();

    // Verify parameterized INSERT
    const insertCall = pool.query.mock.calls[0];
    expect(insertCall[0]).toMatch(/INSERT INTO ai_audit_log/);
    expect(insertCall[1][0]).toBe('Who donated the most?');
  });

  it('POST /ai/audit-log rejects missing required fields', async () => {
    const app = buildApp(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/audit-log',
      payload: {
        natural_language_query: 'test',
        // missing: generated_query, model_id, model_version
      },
    });

    // Zod validation should fail
    expect(res.statusCode).toBe(500); // Fastify wraps Zod errors as 500 unless custom handling
  });

  it('POST /ai/audit-log with client_info', async () => {
    pool.query.mockResolvedValue({
      rows: [{ id: 'uuid-2', timestamp: '2025-06-01T00:00:00Z' }],
    });

    const app = buildApp(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/ai/audit-log',
      payload: {
        natural_language_query: 'Question',
        generated_query: 'MATCH (n) RETURN n',
        model_id: 'phi-3',
        model_version: '1.0',
        client_info: {
          user_agent: 'Mozilla/5.0',
          session_id: '550e8400-e29b-41d4-a716-446655440000',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    // Verify client_info was passed as JSON string
    const insertCall = pool.query.mock.calls[0];
    expect(insertCall[1][6]).toMatch(/Mozilla/);
  });
});
