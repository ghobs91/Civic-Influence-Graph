import { describe, it, expect, vi, beforeEach } from 'vitest';
import type pg from 'pg';
import {
  upsertCandidate,
  upsertCommittee,
  insertDonation,
  processLinkage,
} from '../pipelines/fec-load.js';
import type { ResolutionDecision } from '../resolution/deduplicate.js';
import type { FecRecord } from '../pipelines/fec-parse.js';

// ============================================================
// Mock pg.PoolClient
// ============================================================

function createMockClient() {
  const mockQuery = vi.fn();
  return {
    query: mockQuery,
    _setReturnRows: (rows: Array<Record<string, unknown>>) => {
      mockQuery.mockResolvedValueOnce({ rows, rowCount: rows.length });
    },
  } as unknown as pg.PoolClient & { _setReturnRows: (rows: Array<Record<string, unknown>>) => void };
}

// ============================================================
// upsertCandidate
// ============================================================

describe('upsertCandidate', () => {
  let client: pg.PoolClient & { _setReturnRows: (rows: Array<Record<string, unknown>>) => void };

  beforeEach(() => {
    client = createMockClient();
  });

  it('inserts a new candidate with parameterized query', async () => {
    const record: FecRecord = {
      CAND_ID: 'H8CA52116',
      CAND_NAME: 'SMITH, JOHN A',
      CAND_OFFICE: 'H',
      CAND_OFFICE_ST: 'CA',
      CAND_OFFICE_DISTRICT: '52',
      CAND_PTY_AFFILIATION: 'REP',
    };

    const decision: ResolutionDecision = {
      action: 'insert_new',
      target_id: null,
      score: 0,
      incoming_id: 'H8CA52116',
      canonical_name: 'john a smith',
      name_variants: ['SMITH, JOHN A', 'john a smith'],
      source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
      match_details: null,
    };

    client._setReturnRows([{ id: 'new-uuid-123' }]);
    const id = await upsertCandidate(client, record, decision);
    expect(id).toBe('new-uuid-123');

    // Verify parameterized query was used (no raw SQL injection)
    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('INSERT INTO person');
    expect(callArgs[0]).toContain('$1');
    expect(callArgs[1]).toContain(JSON.stringify([{ source: 'fec', external_id: 'H8CA52116' }]));
    expect(callArgs[1]).toContain('john a smith');
  });

  it('updates existing candidate when merging', async () => {
    const record: FecRecord = {
      CAND_ID: 'H8CA52116',
      CAND_NAME: 'SMITH, JOHN A',
      CAND_OFFICE: 'H',
      CAND_OFFICE_ST: 'CA',
      CAND_OFFICE_DISTRICT: '52',
      CAND_PTY_AFFILIATION: 'REP',
    };

    const decision: ResolutionDecision = {
      action: 'merge_into',
      target_id: 'existing-uuid-456',
      score: 0.95,
      incoming_id: 'H8CA52116',
      canonical_name: 'john a smith',
      name_variants: ['SMITH, JOHN A'],
      source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
      match_details: null,
    };

    client._setReturnRows([{ id: 'existing-uuid-456' }]);
    const id = await upsertCandidate(client, record, decision);
    expect(id).toBe('existing-uuid-456');

    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('UPDATE person');
    expect(callArgs[1][0]).toBe('existing-uuid-456');
  });
});

// ============================================================
// upsertCommittee
// ============================================================

describe('upsertCommittee', () => {
  let client: pg.PoolClient & { _setReturnRows: (rows: Array<Record<string, unknown>>) => void };

  beforeEach(() => {
    client = createMockClient();
  });

  it('inserts a new committee', async () => {
    const record: FecRecord = {
      CMTE_ID: 'C00431445',
      CMTE_NM: 'SMITH FOR CONGRESS',
      CMTE_TP: 'H',
      CMTE_DSGN: 'P',
      CMTE_ST: 'CA',
      TRES_NM: 'JOHN TREASURER',
      CMTE_FILING_FREQ: 'Q',
    };

    const decision: ResolutionDecision = {
      action: 'insert_new',
      target_id: null,
      score: 0,
      incoming_id: 'C00431445',
      canonical_name: 'smith for congress',
      name_variants: ['SMITH FOR CONGRESS'],
      source_ids: [{ source: 'fec', external_id: 'C00431445' }],
      match_details: null,
    };

    client._setReturnRows([{ id: 'cmte-uuid-789' }]);
    const id = await upsertCommittee(client, record, decision);
    expect(id).toBe('cmte-uuid-789');

    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('INSERT INTO committee');
    expect(callArgs[0]).toContain('$1');
  });
});

// ============================================================
// insertDonation
// ============================================================

describe('insertDonation', () => {
  let client: pg.PoolClient & { _setReturnRows: (rows: Array<Record<string, unknown>>) => void };

  beforeEach(() => {
    client = createMockClient();
  });

  it('inserts a donation with all fields parameterized', async () => {
    const record: FecRecord = {
      CMTE_ID: 'C00431445',
      TRANSACTION_TP: '15',
      TRANSACTION_DT: '06152024',
      TRANSACTION_AMT: '2800',
      FILE_NUM: '12345',
      MEMO_CD: '',
      SUB_ID: '4123456789',
    };

    client._setReturnRows([{ id: 'donation-uuid-001' }]);
    const id = await insertDonation(
      client,
      record,
      'person-uuid',
      'person',
      'cmte-uuid',
      '2024',
    );
    expect(id).toBe('donation-uuid-001');

    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('INSERT INTO donation');
    expect(callArgs[1]).toContain('person-uuid');
    expect(callArgs[1]).toContain('person');
    expect(callArgs[1]).toContain('cmte-uuid');
    expect(callArgs[1]).toContain(2800);
    expect(callArgs[1]).toContain('2024-06-15');
    expect(callArgs[1]).toContain('2024');
  });

  it('marks memo transactions correctly', async () => {
    const record: FecRecord = {
      TRANSACTION_TP: '15E',
      TRANSACTION_DT: '03012024',
      TRANSACTION_AMT: '500',
      MEMO_CD: 'X',
      FILE_NUM: '999',
      SUB_ID: '5555',
    };

    client._setReturnRows([{ id: 'donation-memo-001' }]);
    await insertDonation(client, record, 'src', 'person', 'dst', '2024');

    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    // isMemo should be true (index 8 in params array)
    expect(callArgs[1][8]).toBe(true);
  });

  it('throws on missing transaction date', async () => {
    const record: FecRecord = {
      TRANSACTION_TP: '15',
      TRANSACTION_DT: '',
      TRANSACTION_AMT: '500',
      SUB_ID: '1234',
    };

    await expect(
      insertDonation(client, record, 'src', 'person', 'dst', '2024'),
    ).rejects.toThrow('Missing or invalid transaction date');
  });

  it('stores absolute value for negative amounts (refunds)', async () => {
    const record: FecRecord = {
      TRANSACTION_TP: '22Y',
      TRANSACTION_DT: '06152024',
      TRANSACTION_AMT: '-500',
      FILE_NUM: '999',
      SUB_ID: '6666',
    };

    client._setReturnRows([{ id: 'refund-uuid' }]);
    await insertDonation(client, record, 'src', 'person', 'dst', '2024');

    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1][3]).toBe(500); // Math.abs(-500)
  });
});

// ============================================================
// processLinkage
// ============================================================

describe('processLinkage', () => {
  let client: pg.PoolClient & { _setReturnRows: (rows: Array<Record<string, unknown>>) => void };

  beforeEach(() => {
    client = createMockClient();
  });

  it('links committee to candidate', async () => {
    const record: FecRecord = { CAND_ID: 'H8CA52116', CMTE_ID: 'C00431445' };
    const candidateMap = new Map([['H8CA52116', 'person-uuid']]);
    const committeeMap = new Map([['C00431445', 'cmte-uuid']]);

    client._setReturnRows([]);
    const result = await processLinkage(client, record, candidateMap, committeeMap);
    expect(result).toBe(true);

    const callArgs = (client.query as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('UPDATE committee');
    expect(callArgs[1]).toEqual(['person-uuid', 'cmte-uuid']);
  });

  it('returns false when candidate ID not found', async () => {
    const record: FecRecord = { CAND_ID: 'UNKNOWN', CMTE_ID: 'C00431445' };
    const candidateMap = new Map<string, string>();
    const committeeMap = new Map([['C00431445', 'cmte-uuid']]);

    const result = await processLinkage(client, record, candidateMap, committeeMap);
    expect(result).toBe(false);
  });

  it('returns false when committee ID not found', async () => {
    const record: FecRecord = { CAND_ID: 'H8CA52116', CMTE_ID: 'UNKNOWN' };
    const candidateMap = new Map([['H8CA52116', 'person-uuid']]);
    const committeeMap = new Map<string, string>();

    const result = await processLinkage(client, record, candidateMap, committeeMap);
    expect(result).toBe(false);
  });
});
