import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  queryGraph,
  queryTable,
  tableToCsv,
  type GraphNode,
  type GraphEdge,
  type TableRow,
} from '../services/graph.js';

// ============================================================
// MOCK POOL
// ============================================================

interface MockClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

function makeMockClient(queryHandler: (text: string) => { rows: unknown[] }): MockClient {
  return {
    query: vi.fn((text: string) => Promise.resolve(queryHandler(text))),
    release: vi.fn(),
  };
}

function makeMockPool(client: MockClient) {
  return {
    connect: vi.fn(() => Promise.resolve(client)),
  } as unknown as import('pg').Pool;
}

// ============================================================
// AGTYPE MOCK HELPERS
// ============================================================

/**
 * AGE returns agtype values as strings with type annotations.
 * Simulate that behavior for our tests.
 */
function agtypeObj(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + '::vertex';
}

function agtypeStr(val: string): string {
  return `"${val}"::text`;
}

function agtypeNum(val: number): string {
  return `${val}::integer`;
}

// ============================================================
// queryGraph TESTS
// ============================================================

describe('queryGraph', () => {
  it('returns nodes and edges from AGE query', async () => {
    const client = makeMockClient((text) => {
      if (text.includes('LOAD')) return { rows: [] };
      if (text.includes('search_path')) return { rows: [] };
      if (text.includes('MATCH')) {
        return {
          rows: [
            {
              s_id: agtypeNum(1),
              s_label: agtypeStr('Person'),
              s_props: agtypeObj({ id: 'p-001', canonical_name: 'Jane Smith', entity_type: 'legislator' }),
              e_id: agtypeNum(100),
              e_props: agtypeObj({ amount: 5000, transaction_date: '2025-06-01', filing_id: 'FEC-1' }),
              t_id: agtypeNum(2),
              t_label: agtypeStr('Committee'),
              t_props: agtypeObj({ id: 'c-001', name: 'PAC Alpha', committee_type: 'pac' }),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = makeMockPool(client);
    const result = await queryGraph(pool, { edge_types: ['DONATED_TO'], max_nodes: 100 });

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    const person = result.nodes.find((n) => n.id === 'p-001');
    expect(person).toBeDefined();
    expect(person!.label).toBe('Person');
    expect(person!.name).toBe('Jane Smith');

    const committee = result.nodes.find((n) => n.id === 'c-001');
    expect(committee).toBeDefined();
    expect(committee!.label).toBe('Committee');

    expect(result.edges[0].source).toBe('p-001');
    expect(result.edges[0].target).toBe('c-001');
    expect(result.edges[0].label).toBe('DONATED_TO');
    expect(result.edges[0].properties.amount).toBe(5000);
  });

  it('sets up AGE session on the client', async () => {
    const client = makeMockClient(() => ({ rows: [] }));
    const pool = makeMockPool(client);

    await queryGraph(pool, { max_nodes: 10 });

    const calls = client.query.mock.calls.map((c) => c[0] as string);
    expect(calls[0]).toContain("LOAD 'age'");
    expect(calls[1]).toContain('search_path');
  });

  it('releases client even on error', async () => {
    const client = makeMockClient((text) => {
      if (text.includes('MATCH')) throw new Error('AGE error');
      return { rows: [] };
    });
    const pool = makeMockPool(client);

    await expect(queryGraph(pool, { max_nodes: 10 })).rejects.toThrow('AGE error');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('applies date range filters', async () => {
    const client = makeMockClient((text) => {
      if (text.includes('MATCH') && text.includes('2025-01-01') && text.includes('2025-12-31')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const pool = makeMockPool(client);

    await queryGraph(pool, {
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      max_nodes: 10,
    });

    const matchCall = client.query.mock.calls.find((c) => (c[0] as string).includes('MATCH'));
    expect(matchCall).toBeDefined();
    expect(matchCall![0]).toContain("e.transaction_date >= '2025-01-01'");
    expect(matchCall![0]).toContain("e.transaction_date <= '2025-12-31'");
  });

  it('applies min_amount filter', async () => {
    const client = makeMockClient(() => ({ rows: [] }));
    const pool = makeMockPool(client);

    await queryGraph(pool, { min_amount: 5000, max_nodes: 10 });

    const matchCall = client.query.mock.calls.find((c) => (c[0] as string).includes('MATCH'));
    expect(matchCall![0]).toContain('e.amount >= 5000');
  });

  it('filters by entity_id center node', async () => {
    const client = makeMockClient(() => ({ rows: [] }));
    const pool = makeMockPool(client);

    await queryGraph(pool, { entity_id: 'aaaaaaaa-0000-0000-0000-000000000001', max_nodes: 50 });

    const matchCall = client.query.mock.calls.find((c) => (c[0] as string).includes('MATCH'));
    expect(matchCall![0]).toContain('aaaaaaaa-0000-0000-0000-000000000001');
  });

  it('deduplicates nodes across edge types', async () => {
    let callCount = 0;
    const client = makeMockClient((text) => {
      if (text.includes('MATCH')) {
        callCount++;
        // Both DONATED_TO and LOBBIED_FOR return the same source node
        return {
          rows: [
            {
              s_id: agtypeNum(1),
              s_label: agtypeStr('Organization'),
              s_props: agtypeObj({ id: 'shared-org', name: 'Acme Corp' }),
              e_id: agtypeNum(callCount * 100),
              e_props: agtypeObj({ amount: 1000 }),
              t_id: agtypeNum(callCount * 10),
              t_label: agtypeStr('Committee'),
              t_props: agtypeObj({ id: `target-${callCount}`, name: `Target ${callCount}` }),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const pool = makeMockPool(client);

    const result = await queryGraph(pool, {
      edge_types: ['DONATED_TO', 'LOBBIED_FOR'],
      max_nodes: 100,
    });

    // 'shared-org' should appear once, plus two different targets
    const orgNodes = result.nodes.filter((n) => n.id === 'shared-org');
    expect(orgNodes).toHaveLength(1);
    expect(result.edges).toHaveLength(2);
  });

  it('rejects invalid edge types', async () => {
    const client = makeMockClient(() => ({ rows: [] }));
    const pool = makeMockPool(client);

    await queryGraph(pool, { edge_types: ['INVALID_TYPE', 'DONATED_TO'], max_nodes: 10 });

    const matchCalls = client.query.mock.calls.filter((c) => (c[0] as string).includes('MATCH'));
    // Only DONATED_TO should be queried, INVALID_TYPE is filtered out
    expect(matchCalls).toHaveLength(1);
    expect(matchCalls[0][0]).toContain('DONATED_TO');
  });

  it('enforces max_nodes limit', async () => {
    let callIdx = 0;
    const client = makeMockClient((text) => {
      if (text.includes('MATCH')) {
        callIdx++;
        // Return 3 unique nodes per call
        return {
          rows: [
            {
              s_id: agtypeNum(callIdx * 10),
              s_label: agtypeStr('Person'),
              s_props: agtypeObj({ id: `s-${callIdx}`, canonical_name: `Source ${callIdx}` }),
              e_id: agtypeNum(callIdx * 100),
              e_props: agtypeObj({ amount: 100 }),
              t_id: agtypeNum(callIdx * 10 + 1),
              t_label: agtypeStr('Committee'),
              t_props: agtypeObj({ id: `t-${callIdx}`, name: `Target ${callIdx}` }),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const pool = makeMockPool(client);

    const result = await queryGraph(pool, { max_nodes: 2 });

    // Should stop after hitting the max_nodes limit
    expect(result.nodes.length).toBeLessThanOrEqual(2);
  });
});

// ============================================================
// queryTable TESTS
// ============================================================

describe('queryTable', () => {
  it('returns flat table rows with total count', async () => {
    const client = makeMockClient((text) => {
      if (text.includes('LOAD') || text.includes('search_path')) return { rows: [] };
      if (text.includes('count(e)')) {
        return { rows: [{ cnt: agtypeNum(1) }] };
      }
      if (text.includes('MATCH')) {
        return {
          rows: [
            {
              s_props: agtypeObj({ id: 'p1', canonical_name: 'Alice' }),
              s_label: agtypeStr('Person'),
              e_props: agtypeObj({ amount: 2500, transaction_date: '2025-03-15', filing_id: 'FEC-99' }),
              t_props: agtypeObj({ id: 'c1', name: 'PAC-Z' }),
              t_label: agtypeStr('Committee'),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const pool = makeMockPool(client);

    const result = await queryTable(pool, { edge_types: ['DONATED_TO'], max_nodes: 100, page: 1, page_size: 50 });

    expect(result.total_count).toBeGreaterThanOrEqual(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].source_name).toBe('Alice');
    expect(result.rows[0].target_name).toBe('PAC-Z');
    expect(result.rows[0].amount).toBe(2500);
    expect(result.rows[0].filing_id).toBe('FEC-99');
  });

  it('caps page_size at 1000', async () => {
    const client = makeMockClient((text) => {
      if (text.includes('LIMIT')) {
        expect(text).toContain('LIMIT 1000');
      }
      return { rows: [] };
    });
    const pool = makeMockPool(client);

    await queryTable(pool, { max_nodes: 100, page: 1, page_size: 5000 });
  });
});

// ============================================================
// tableToCsv TESTS
// ============================================================

describe('tableToCsv', () => {
  it('produces CSV with headers and data rows', () => {
    const rows: TableRow[] = [
      {
        source_id: 'p1',
        source_name: 'Alice',
        source_type: 'Person',
        target_id: 'c1',
        target_name: 'PAC-Z',
        target_type: 'Committee',
        edge_type: 'DONATED_TO',
        amount: 2500,
        date: '2025-03-15',
        filing_id: 'FEC-99',
      },
    ];

    const csv = tableToCsv(rows);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('source_id,source_name,source_type,target_id,target_name,target_type,edge_type,amount,date,filing_id');
    expect(lines[1]).toBe('p1,Alice,Person,c1,PAC-Z,Committee,DONATED_TO,2500,2025-03-15,FEC-99');
  });

  it('escapes fields containing commas', () => {
    const rows: TableRow[] = [
      {
        source_id: 'p1',
        source_name: 'Smith, John',
        source_type: 'Person',
        target_id: 'c1',
        target_name: 'Normal Name',
        target_type: 'Committee',
        edge_type: 'DONATED_TO',
        amount: 100,
        date: '2025-01-01',
        filing_id: null,
      },
    ];

    const csv = tableToCsv(rows);
    const lines = csv.split('\n');
    expect(lines[1]).toContain('"Smith, John"');
  });

  it('handles null values', () => {
    const rows: TableRow[] = [
      {
        source_id: 'p1',
        source_name: 'Test',
        source_type: 'Person',
        target_id: 'c1',
        target_name: 'Target',
        target_type: 'Committee',
        edge_type: 'DONATED_TO',
        amount: null,
        date: null,
        filing_id: null,
      },
    ];

    const csv = tableToCsv(rows);
    const lines = csv.split('\n');
    // null fields render as empty strings in CSV
    expect(lines[1]).toMatch(/,,,$/);

  });
});
