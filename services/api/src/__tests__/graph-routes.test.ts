import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerGraphRoutes, type GraphDeps } from '../routes/graph.js';

// Mock the graph service
vi.mock('../services/graph.js', () => ({
  queryGraph: vi.fn(),
  queryTable: vi.fn(),
  tableToCsv: vi.fn(),
}));

import { queryGraph, queryTable, tableToCsv } from '../services/graph.js';
const mockQueryGraph = queryGraph as ReturnType<typeof vi.fn>;
const mockQueryTable = queryTable as ReturnType<typeof vi.fn>;
const mockTableToCsv = tableToCsv as ReturnType<typeof vi.fn>;

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeMockPool() {
  return {} as unknown as GraphDeps['pool'];
}

beforeEach(() => {
  mockQueryGraph.mockReset();
  mockQueryTable.mockReset();
  mockTableToCsv.mockReset();
});

// ============================================================
// POST /api/v1/graph/query
// ============================================================

describe('POST /api/v1/graph/query', () => {
  it('returns nodes and edges with valid filters', async () => {
    mockQueryGraph.mockResolvedValue({
      nodes: [
        { id: 'n1', label: 'Person', name: 'Alice', properties: {} },
        { id: 'n2', label: 'Committee', name: 'PAC-A', properties: {} },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', label: 'DONATED_TO', properties: { amount: 5000 } },
      ],
    });

    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/graph/query',
      payload: {
        center_entity_id: VALID_UUID,
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        min_amount: 1000,
        max_nodes: 50,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.nodes).toHaveLength(2);
    expect(body.data.edges).toHaveLength(1);
    expect(body.meta.request_id).toBeDefined();

    // Verify service was called with correct parameters
    expect(mockQueryGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entity_id: VALID_UUID,
        start_date: '2025-01-01',
        end_date: '2025-12-31',
        min_amount: 1000,
        max_nodes: 50,
      }),
    );
  });

  it('returns 400 for missing request body', async () => {
    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/graph/query',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid max_nodes', async () => {
    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/graph/query',
      payload: { max_nodes: 10000 },
    });

    expect(res.statusCode).toBe(400);
  });

  it('accepts minimal empty body with defaults', async () => {
    mockQueryGraph.mockResolvedValue({ nodes: [], edges: [] });

    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/graph/query',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(mockQueryGraph).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ max_nodes: 100 }),
    );
  });
});

// ============================================================
// GET /api/v1/graph/table
// ============================================================

describe('GET /api/v1/graph/table', () => {
  it('returns JSON table rows by default', async () => {
    mockQueryTable.mockResolvedValue({
      rows: [
        {
          source_id: 'p1', source_name: 'Alice', source_type: 'Person',
          target_id: 'c1', target_name: 'PAC-Z', target_type: 'Committee',
          edge_type: 'DONATED_TO', amount: 2500, date: '2025-03-15', filing_id: 'FEC-99',
        },
      ],
      total_count: 1,
    });

    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/graph/table?start_date=2025-01-01&page=1&page_size=50',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0].source_name).toBe('Alice');
    expect(body.meta.total_count).toBe(1);
  });

  it('returns CSV when format=csv', async () => {
    mockQueryTable.mockResolvedValue({ rows: [{ source_id: 'p1' }], total_count: 1 });
    mockTableToCsv.mockReturnValue('header\np1');

    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/graph/table?format=csv',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('graph-table.csv');
    expect(res.payload).toBe('header\np1');
  });

  it('parses comma-separated edge_types', async () => {
    mockQueryTable.mockResolvedValue({ rows: [], total_count: 0 });

    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    await server.inject({
      method: 'GET',
      url: '/api/v1/graph/table?edge_types=DONATED_TO,LOBBIED_FOR',
    });

    expect(mockQueryTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        edge_types: ['DONATED_TO', 'LOBBIED_FOR'],
      }),
    );
  });

  it('maps center_entity_id to entity_id', async () => {
    mockQueryTable.mockResolvedValue({ rows: [], total_count: 0 });

    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    await server.inject({
      method: 'GET',
      url: `/api/v1/graph/table?center_entity_id=${VALID_UUID}`,
    });

    expect(mockQueryTable).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entity_id: VALID_UUID,
      }),
    );
  });

  it('returns 400 for invalid format', async () => {
    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/graph/table?format=xml',
    });

    expect(res.statusCode).toBe(400);
  });

  it('enforces page_size max of 1000', async () => {
    const server = Fastify();
    registerGraphRoutes(server, { pool: makeMockPool() });
    await server.ready();

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/graph/table?page_size=5000',
    });

    expect(res.statusCode).toBe(400);
  });
});
