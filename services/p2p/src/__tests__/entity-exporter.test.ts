import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock corestore, hyperbee, hyperdrive
vi.mock('corestore', () => {
  const mockCore = {
    ready: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    key: Buffer.alloc(32, 0xab),
    length: 42,
    writable: true,
  };
  return {
    default: vi.fn().mockImplementation(() => ({
      ready: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockReturnValue(mockCore),
      close: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('hyperbee', () => {
  return {
    default: vi.fn().mockImplementation((core: unknown) => ({
      ready: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      core,
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
    })),
  };
});

vi.mock('hyperdrive', () => {
  const mockCore = {
    ready: vi.fn().mockResolvedValue(undefined),
    key: Buffer.alloc(32, 0xcd),
    length: 10,
    writable: true,
  };
  return {
    default: vi.fn().mockImplementation(() => ({
      ready: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      core: mockCore,
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
    })),
  };
});

import { exportEntities, normalizeName } from '../export/entity-exporter.js';

describe('entity-exporter', () => {
  it('normalizeName lowercases and strips diacritics', () => {
    expect(normalizeName('José García')).toBe('jose garcia');
  });

  it('normalizeName collapses whitespace', () => {
    expect(normalizeName('  John   Doe  ')).toBe('john doe');
  });

  it('normalizeName strips non-alphanumeric chars', () => {
    expect(normalizeName("O'Brien-Smith")).toBe('obriensmith');
  });

  it('exportEntities writes primary key and indexes', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'uuid-1',
            entity_type: 'person',
            canonical_name: 'Jane Smith',
            name_variants: ['SMITH, JANE'],
            source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
            party: 'D',
            jurisdictions: ['federal', 'CA'],
            sector_id: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
            version: 1,
          },
        ],
      }),
    } as any;

    const putCalls: Array<[string, unknown]> = [];
    const mockBee = {
      put: vi.fn().mockImplementation((key: string, value: unknown) => {
        putCalls.push([key, value]);
        return Promise.resolve();
      }),
    } as any;

    const stats = await exportEntities(mockPool, mockBee);
    // 5 entity types queried
    expect(mockPool.query).toHaveBeenCalledTimes(5);
    // For the first entity type that has data: 1 primary + 1 name + 1 source + 2 jurisdictions = 5 puts
    // But all 5 queries return the same mock data, so 5 * 5 = 25
    expect(stats.entitiesExported).toBe(5); // 1 per entity type
    expect(stats.indexEntriesWritten).toBeGreaterThan(0);
  });

  it('exportEntities handles empty tables', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as any;
    const mockBee = { put: vi.fn() } as any;

    const stats = await exportEntities(mockPool, mockBee);
    expect(stats.entitiesExported).toBe(0);
    expect(stats.indexEntriesWritten).toBe(0);
  });
});
