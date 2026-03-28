import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));

import { exportSnapshot } from '../export/snapshot.js';

describe('snapshot', () => {
  it('exports entity and relationship tables as JSONL.gz', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { row_to_json: { id: '1', name: 'Test' } },
          { row_to_json: { id: '2', name: 'Other' } },
        ],
      }),
    } as any;

    const putCalls: Array<[string, Buffer]> = [];
    const mockDrive = {
      ready: vi.fn().mockResolvedValue(undefined),
      core: { key: Buffer.alloc(32, 0xab) },
      put: vi.fn().mockImplementation((path: string, data: Buffer) => {
        putCalls.push([path, data]);
        return Promise.resolve();
      }),
    } as any;

    const stats = await exportSnapshot(mockPool, mockDrive, {
      dataSources: ['fec'],
      electionCycles: ['2024'],
      prevSnapshotSeq: 0,
      currentSeq: 100,
    });

    // 5 entity tables + 4 relationship tables = 9 queries + manifest
    expect(mockPool.query).toHaveBeenCalledTimes(9);
    // Each query returns 2 rows → 9 * 2 = 18 records
    expect(stats.totalRecords).toBe(18);
    // 9 JSONL.gz files + 1 manifest = 10 puts
    expect(putCalls.length).toBe(10);
    // Last put should be manifest.json
    expect(putCalls[9][0]).toBe('/manifest.json');

    const manifest = JSON.parse(putCalls[9][1].toString('utf-8'));
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.data_sources).toEqual(['fec']);
    expect(manifest.current_seq).toBe(100);
    expect(manifest.checksum_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles empty tables gracefully', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as any;

    const mockDrive = {
      ready: vi.fn().mockResolvedValue(undefined),
      core: { key: Buffer.alloc(32, 0xab) },
      put: vi.fn().mockResolvedValue(undefined),
    } as any;

    const stats = await exportSnapshot(mockPool, mockDrive, {
      dataSources: [],
      electionCycles: [],
      prevSnapshotSeq: 0,
      currentSeq: 0,
    });

    expect(stats.totalRecords).toBe(0);
  });
});
