import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));

import { importSnapshot } from '../import/importer.js';

describe('importer', () => {
  function makeDrive(files: Record<string, unknown>) {
    return {
      ready: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/manifest.json') {
          return Promise.resolve(Buffer.from(JSON.stringify(files['/manifest.json']), 'utf-8'));
        }
        const data = files[path];
        if (!data) return Promise.resolve(null);
        // Entity/relationship files are JSONL.gz
        const lines = (data as unknown[]).map((r) => JSON.stringify(r)).join('\n') + '\n';
        return Promise.resolve(gzipSync(Buffer.from(lines, 'utf-8')));
      }),
    } as any;
  }

  it('imports snapshot data into staging table', async () => {
    const manifest = {
      version: '1.0.0',
      created_at: '2026-01-01T00:00:00Z',
      node_public_key: 'ab'.repeat(32),
      record_counts: { persons: 1, committees: 0, organizations: 0, bills: 0, sectors: 0, donations: 0, lobbying: 0, votes: 0, affiliations: 0 },
      data_sources: ['fec'],
      election_cycles: ['2024'],
      prev_snapshot_seq: 0,
      current_seq: 10,
      checksum_sha256: 'ab'.repeat(32),
    };

    const drive = makeDrive({
      '/manifest.json': manifest,
      '/entities/persons.jsonl.gz': [{ id: 'p1', canonical_name: 'Jane' }],
      '/entities/committees.jsonl.gz': [],
      '/entities/organizations.jsonl.gz': [],
      '/entities/bills.jsonl.gz': [],
      '/entities/sectors.jsonl.gz': [],
      '/relationships/donations.jsonl.gz': [],
      '/relationships/lobbying.jsonl.gz': [],
      '/relationships/votes.jsonl.gz': [],
      '/relationships/affiliations.jsonl.gz': [],
    });

    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as any;

    const stats = await importSnapshot(drive, mockPool);
    expect(stats.totalImported).toBe(1);
    expect(stats.entities.persons).toBe(1);
    expect(mockPool.query).toHaveBeenCalled();
    // Check that parameterized query was used (for SQL injection prevention)
    const firstCallArgs = mockPool.query.mock.calls[0];
    expect(firstCallArgs[0]).toContain('$1');
  });

  it('throws when manifest is missing', async () => {
    const drive = {
      ready: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
    } as any;
    const mockPool = {} as any;

    await expect(importSnapshot(drive, mockPool)).rejects.toThrow('Snapshot manifest not found');
  });
});
