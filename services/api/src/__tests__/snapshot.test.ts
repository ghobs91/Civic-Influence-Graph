import { describe, it, expect, vi } from 'vitest';
import { generateSnapshot, exportTable } from '../services/snapshot.js';

describe('exportTable', () => {
  it('exports a valid table as JSONL.gz', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { data: { id: '1', name: 'Test Person' } },
          { data: { id: '2', name: 'Another Person' } },
        ],
      }),
    };

    const result = await exportTable(mockPool as any, 'person', 'entities/person.jsonl.gz');
    expect(result.table).toBe('person');
    expect(result.path).toBe('entities/person.jsonl.gz');
    expect(result.recordCount).toBe(2);
    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('throws for unknown table', async () => {
    const mockPool = { query: vi.fn() };
    await expect(exportTable(mockPool as any, 'malicious_table', 'test')).rejects.toThrow('Unknown table');
  });

  it('handles empty table', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const result = await exportTable(mockPool as any, 'sector', 'entities/sector.jsonl.gz');
    expect(result.recordCount).toBe(0);
    expect(result.data).toBeInstanceOf(Buffer);
  });
});

describe('generateSnapshot', () => {
  it('exports all 9 tables and produces a manifest', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ data: { id: '1', name: 'Test' } }],
      }),
    };

    const { manifest, files } = await generateSnapshot(mockPool as any);
    // 5 entity + 4 relationship tables
    expect(files).toHaveLength(9);
    expect(manifest.files).toHaveLength(9);
    expect(manifest.total_records).toBe(9); // 1 row per table
    expect(manifest.id).toMatch(/^[0-9a-f]+$/);
    expect(manifest.version).toBe('1.0');
    expect(manifest.election_cycles).toContain('2024');
    expect(manifest.data_sources).toContain('fec');
    expect(mockPool.query).toHaveBeenCalledTimes(9);
  });
});
