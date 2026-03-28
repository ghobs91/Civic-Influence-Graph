import { describe, it, expect, vi } from 'vitest';

vi.mock('corestore', () => ({ default: vi.fn() }));
vi.mock('hyperbee', () => ({ default: vi.fn() }));
vi.mock('hyperdrive', () => ({ default: vi.fn() }));

import { exportRelationships } from '../export/relationship-exporter.js';

describe('relationship-exporter', () => {
  it('exports donations, lobbying, votes, affiliations', async () => {
    const donationRow = {
      id: 'd1',
      source_entity_id: 'src-1',
      destination_entity_id: 'dst-1',
      amount: 2800,
      transaction_date: '2025-10-15',
      transaction_type: 'direct_contribution',
      fec_transaction_type: '15',
      election_cycle: '2026',
      filing_id: 'FEC-123',
      source_system: 'fec',
      source_record_id: '999',
      is_memo: false,
      amendment_chain: [],
      amendment_status: 'NEW',
      created_at: '2026-01-01T00:00:00Z',
    };

    const mockPool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [donationRow] })   // donations
        .mockResolvedValueOnce({ rows: [] })               // lobbying
        .mockResolvedValueOnce({ rows: [] })               // votes
        .mockResolvedValueOnce({ rows: [] }),              // affiliations
    } as any;

    const putCalls: string[] = [];
    const mockBee = {
      put: vi.fn().mockImplementation((key: string) => {
        putCalls.push(key);
        return Promise.resolve();
      }),
    } as any;

    const stats = await exportRelationships(mockPool, mockBee);
    expect(stats.donations).toBe(1);
    expect(stats.totalExported).toBe(1);
    // Should have primary + reverse index for donation = 2 puts
    expect(putCalls.length).toBe(2);
    expect(putCalls[0]).toMatch(/^donation\/dst-1/);
    expect(putCalls[1]).toMatch(/^donation-source\/src-1/);
  });

  it('returns zero stats for empty tables', async () => {
    const mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as any;
    const mockBee = { put: vi.fn() } as any;

    const stats = await exportRelationships(mockPool, mockBee);
    expect(stats.totalExported).toBe(0);
    expect(stats.donations).toBe(0);
    expect(stats.lobbying).toBe(0);
    expect(stats.votes).toBe(0);
    expect(stats.affiliations).toBe(0);
  });
});
