import { describe, it, expect, vi } from 'vitest';
import {
  computeFundingSummary,
  computeLobbySummary,
  computeVotingSummary,
  computeDashboard,
  type FundingSummary,
  type LobbySummary,
  type VotingSummary,
} from '../services/dashboard.js';
import type pg from 'pg';

const ENTITY_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeMockPool(handler: (text: string, params?: unknown[]) => { rows: unknown[] }) {
  return { query: vi.fn((text: string, params?: unknown[]) => Promise.resolve(handler(text, params))) } as unknown as pg.Pool;
}

describe('computeFundingSummary', () => {
  it('should compute total received and given', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('GROUP BY s.id')) {
        return { rows: [{ sector: 'Defense', sector_id: 'abc', amount: '80000', count: '10' }] };
      }
      if (text.includes('GROUP BY d.source_entity_id')) {
        return { rows: [{ entity_id: ENTITY_ID, entity_type: 'person', name: 'John Doe', amount: '50000', count: '3' }] };
      }
      if (text.includes('destination_entity_id') && text.includes('SUM')) {
        return { rows: [{ total: '150000' }] };
      }
      if (text.includes('source_entity_id') && text.includes('SUM')) {
        return { rows: [{ total: '25000' }] };
      }
      return { rows: [] };
    });

    const result = await computeFundingSummary(pool, ENTITY_ID, {});
    expect(result.total_received).toBe(150000);
    expect(result.total_given).toBe(25000);
    expect(result.by_sector).toHaveLength(1);
    expect(result.by_sector[0].sector).toBe('Defense');
    expect(result.top_counterparties).toHaveLength(1);
  });

  it('should pass date range filters', async () => {
    const pool = makeMockPool(() => ({ rows: [{ total: '0' }] }));

    await computeFundingSummary(pool, ENTITY_ID, { start_date: '2024-01-01', end_date: '2024-12-31' });

    const calls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const firstCall = calls[0];
    expect(firstCall[0]).toContain('transaction_date >= $2');
    expect(firstCall[1]).toContain('2024-01-01');
  });
});

describe('computeLobbySummary', () => {
  it('should compute lobby summary', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('jsonb_array_elements')) {
        return { rows: [{ issue: 'Defense', cnt: '8' }, { issue: 'Energy', cnt: '5' }] };
      }
      if (text.includes('COUNT(*)') && text.includes('client_id') && text.includes('GROUP BY')) {
        return { rows: [{ org_id: ENTITY_ID, name: 'BigCorp', engagement_count: '5' }] };
      }
      if (text.includes('COUNT(*)')) {
        return { rows: [{ total: '15' }] };
      }
      return { rows: [] };
    });

    const result = await computeLobbySummary(pool, ENTITY_ID);
    expect(result.engagements_mentioning).toBe(15);
    expect(result.top_clients).toHaveLength(1);
    expect(result.top_issues).toEqual(['Defense', 'Energy']);
  });
});

describe('computeVotingSummary', () => {
  it('should compute voting summary', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('total_votes')) {
        return { rows: [{ total_votes: '342', yea_count: '310', nay_count: '32' }] };
      }
      if (text.includes('party')) {
        return { rows: [{ party: 'D' }] };
      }
      if (text.includes('ORDER BY v.vote_date')) {
        return { rows: [{ bill_id: ENTITY_ID, bill_number: 'H.R.1234', vote_cast: 'yea', vote_date: '2026-02-15' }] };
      }
      return { rows: [] };
    });

    const result = await computeVotingSummary(pool, ENTITY_ID);
    expect(result.total_votes).toBe(342);
    expect(result.by_party_alignment.with_party).toBe(310);
    expect(result.by_party_alignment.against_party).toBe(32);
    expect(result.recent_votes).toHaveLength(1);
  });
});

describe('computeDashboard', () => {
  it('should return full dashboard data', async () => {
    const pool = makeMockPool((text) => {
      if (text.includes('FROM person WHERE')) {
        return { rows: [{ id: ENTITY_ID, canonical_name: 'Jane Smith', entity_type: 'legislator' }] };
      }
      if (text.includes('SUM') && text.includes('destination')) {
        return { rows: [{ total: '100000' }] };
      }
      if (text.includes('SUM') && text.includes('source_entity_id')) {
        return { rows: [{ total: '0' }] };
      }
      if (text.includes('total_votes')) {
        return { rows: [{ total_votes: '100', yea_count: '80', nay_count: '20' }] };
      }
      if (text.includes('party') && !text.includes('total')) {
        return { rows: [{ party: 'D' }] };
      }
      return { rows: [] };
    });

    const result = await computeDashboard(pool, ENTITY_ID, {});
    expect(result.entity.canonical_name).toBe('Jane Smith');
    expect(result.funding_summary.total_received).toBe(100000);
    expect(result.voting_summary.total_votes).toBe(100);
  });
});
