import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerSavedQueryRoutes, type SavedQueryDeps } from '../routes/saved-queries.js';

describe('registerSavedQueryRoutes', () => {
  let server: ReturnType<typeof Fastify>;
  const bearerTokens = new Set(['test-token-abc']);
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockPool = {
      query: vi.fn(),
    };

    server = Fastify();
    registerSavedQueryRoutes(server, {
      pool: mockPool as unknown as SavedQueryDeps['pool'],
      bearerTokens,
    });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('POST /api/v1/saved-queries', () => {
    it('requires bearer token', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/saved-queries',
        payload: { name: 'Test', query_type: 'search', query_config: {} },
      });
      expect(res.statusCode).toBe(401);
    });

    it('validates request body', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/saved-queries',
        headers: { authorization: 'Bearer test-token-abc' },
        payload: { name: '', query_type: 'invalid' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('creates a saved query', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440000', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      });

      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/saved-queries',
        headers: { authorization: 'Bearer test-token-abc' },
        payload: { name: 'Defense donors', query_type: 'search', query_config: { q: 'defense' } },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe('Defense donors');
      expect(body.data.query_type).toBe('search');
    });
  });

  describe('GET /api/v1/saved-queries/:id', () => {
    it('requires bearer token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/saved-queries/550e8400-e29b-41d4-a716-446655440000',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/saved-queries/not-a-uuid',
        headers: { authorization: 'Bearer test-token-abc' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('returns 404 for nonexistent query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/saved-queries/550e8400-e29b-41d4-a716-446655440000',
        headers: { authorization: 'Bearer test-token-abc' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns a saved query', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Defense donors',
          query_type: 'search',
          query_config: { q: 'defense' },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        }],
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/saved-queries/550e8400-e29b-41d4-a716-446655440000',
        headers: { authorization: 'Bearer test-token-abc' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.name).toBe('Defense donors');
    });
  });

  describe('GET /api/v1/saved-queries/:id/execute', () => {
    it('requires bearer token', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/saved-queries/550e8400-e29b-41d4-a716-446655440000/execute',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for nonexistent query', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/saved-queries/550e8400-e29b-41d4-a716-446655440000/execute',
        headers: { authorization: 'Bearer test-token-abc' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('executes a search-type saved query', async () => {
      // First query: get saved query definition
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Test',
          query_type: 'search',
          query_config: { q: 'smith' },
        }],
      });
      // Second query: execute the search
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: '1', canonical_name: 'John Smith', entity_type: 'legislator', party: 'D', jurisdictions: ['CA'] }],
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/saved-queries/550e8400-e29b-41d4-a716-446655440000/execute',
        headers: { authorization: 'Bearer test-token-abc' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.results.results).toHaveLength(1);
    });

    it('executes a graph-type saved query', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Graph test',
          query_type: 'graph',
          query_config: { center_entity_id: '550e8400-e29b-41d4-a716-446655440001' },
        }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'd1', source_entity_id: 'a', destination_entity_id: 'b', amount: 1000, transaction_date: '2025-01-01', election_cycle: '2026' }],
      });

      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/saved-queries/550e8400-e29b-41d4-a716-446655440000/execute',
        headers: { authorization: 'Bearer test-token-abc' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.results.edges).toHaveLength(1);
    });
  });
});
