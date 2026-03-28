import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { buildSearchQuery, registerSearchRoute, type SearchDeps } from '../routes/search.js';
import { buildMeta, sendResponse } from '../middleware/response.js';

describe('buildSearchQuery', () => {
  it('should build a basic query with just q param', () => {
    const result = buildSearchQuery({ q: 'Nancy Pelosi', page: 1, page_size: 20 });
    expect(result.query.bool.must).toHaveLength(1);
    expect(result.query.bool.filter).toHaveLength(0);
    expect(result.from).toBe(0);
    expect(result.size).toBe(20);
  });

  it('should add type filter', () => {
    const result = buildSearchQuery({ q: 'test', type: 'person', page: 1, page_size: 20 });
    expect(result.query.bool.filter).toHaveLength(1);
    expect(result.query.bool.filter[0]).toEqual({ term: { entity_type: 'person' } });
  });

  it('should add jurisdiction filter', () => {
    const result = buildSearchQuery({ q: 'test', jurisdiction: 'CA', page: 1, page_size: 20 });
    expect(result.query.bool.filter[0]).toEqual({ term: { jurisdiction: 'CA' } });
  });

  it('should add sector filter', () => {
    const result = buildSearchQuery({ q: 'test', sector: 'defense', page: 1, page_size: 20 });
    expect(result.query.bool.filter[0]).toEqual({ term: { sector: 'defense' } });
  });

  it('should combine multiple filters', () => {
    const result = buildSearchQuery({
      q: 'test',
      type: 'committee',
      jurisdiction: 'federal',
      sector: 'energy',
      page: 1,
      page_size: 20,
    });
    expect(result.query.bool.filter).toHaveLength(3);
  });

  it('should calculate correct offset for pagination', () => {
    const result = buildSearchQuery({ q: 'test', page: 3, page_size: 50 });
    expect(result.from).toBe(100);
    expect(result.size).toBe(50);
  });
});

describe('registerSearchRoute (integration)', () => {
  let mockClient: { search: ReturnType<typeof vi.fn> };
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    mockClient = {
      search: vi.fn().mockResolvedValue({
        body: {
          hits: {
            total: { value: 1 },
            hits: [
              {
                _id: 'abc-123',
                _score: 0.95,
                _source: {
                  id: '550e8400-e29b-41d4-a716-446655440000',
                  entity_type: 'person',
                  canonical_name: 'Nancy Pelosi',
                  name_variants: ['PELOSI, NANCY'],
                  jurisdiction: 'federal',
                  party: 'D',
                },
              },
            ],
          },
        },
      }),
    };

    server = Fastify();
    registerSearchRoute(server, { opensearch: mockClient as unknown as SearchDeps['opensearch'] });
    await server.ready();
  });

  it('should return search results', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/search?q=Nancy+Pelosi',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.data.results).toHaveLength(1);
    expect(body.data.results[0].canonical_name).toBe('Nancy Pelosi');
    expect(body.data.results[0].relevance_score).toBe(0.95);
    expect(body.meta.total_count).toBe(1);
  });

  it('should return 400 for missing q parameter', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/search',
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should pass filters to OpenSearch', async () => {
    await server.inject({
      method: 'GET',
      url: '/api/v1/search?q=test&type=person&jurisdiction=CA',
    });

    expect(mockClient.search).toHaveBeenCalledOnce();
    const searchBody = mockClient.search.mock.calls[0][0].body;
    expect(searchBody.query.bool.filter).toHaveLength(2);
  });

  it('should handle pagination params', async () => {
    await server.inject({
      method: 'GET',
      url: '/api/v1/search?q=test&page=2&page_size=10',
    });

    const searchBody = mockClient.search.mock.calls[0][0].body;
    expect(searchBody.from).toBe(10);
    expect(searchBody.size).toBe(10);
  });
});
