import { describe, it, expect, vi } from 'vitest';
import {
  extractCandidateEntity,
  extractCommitteeEntity,
  extractIndividualEntity,
  resolveEntity,
  deduplicateBatch,
  type EntityCandidate,
  type CandidateLookup,
} from '../resolution/deduplicate.js';
import type { FecRecord } from '../pipelines/fec-parse.js';

// ============================================================
// extractCandidateEntity
// ============================================================

describe('extractCandidateEntity', () => {
  it('normalizes LAST, FIRST name order', () => {
    const record: FecRecord = { CAND_ID: 'H8CA52116', CAND_NAME: 'SMITH, JOHN A' };
    const result = extractCandidateEntity(record);
    expect(result.canonical_name).toBe('john a smith');
    expect(result.source_ids).toEqual([{ source: 'fec', external_id: 'H8CA52116' }]);
    expect(result.name_variants).toContain('SMITH, JOHN A');
  });

  it('handles empty name', () => {
    const record: FecRecord = { CAND_ID: 'H8CA52116', CAND_NAME: '' };
    const result = extractCandidateEntity(record);
    expect(result.canonical_name).toBe('');
  });

  it('handles missing CAND_ID', () => {
    const record: FecRecord = { CAND_NAME: 'DOE, JANE' };
    const result = extractCandidateEntity(record);
    expect(result.source_ids).toEqual([]);
    expect(result.external_id).toBe('');
  });
});

// ============================================================
// extractCommitteeEntity
// ============================================================

describe('extractCommitteeEntity', () => {
  it('normalizes committee name', () => {
    const record: FecRecord = { CMTE_ID: 'C00431445', CMTE_NM: 'SMITH FOR CONGRESS' };
    const result = extractCommitteeEntity(record);
    expect(result.canonical_name).toBe('smith for congress');
    expect(result.source_ids).toEqual([{ source: 'fec', external_id: 'C00431445' }]);
    expect(result.name_variants).toContain('SMITH FOR CONGRESS');
  });
});

// ============================================================
// extractIndividualEntity
// ============================================================

describe('extractIndividualEntity', () => {
  it('normalizes individual name and extracts employer/occupation', () => {
    const record: FecRecord = {
      NAME: 'DOE, JOHN',
      EMPLOYER: 'ACME INC',
      OCCUPATION: 'ENGINEER',
      SUB_ID: '4123456789',
    };
    const result = extractIndividualEntity(record);
    expect(result.canonical_name).toBe('john doe');
    expect(result.employer).toBe('ACME INC');
    expect(result.occupation).toBe('ENGINEER');
    expect(result.source_ids).toEqual([{ source: 'fec_indiv', external_id: '4123456789' }]);
  });

  it('handles missing fields', () => {
    const record: FecRecord = { NAME: 'DOE, JANE' };
    const result = extractIndividualEntity(record);
    expect(result.canonical_name).toBe('jane doe');
    expect(result.employer).toBe('');
    expect(result.occupation).toBe('');
    expect(result.source_ids).toEqual([]);
  });
});

// ============================================================
// resolveEntity
// ============================================================

describe('resolveEntity', () => {
  const emptyLookup: CandidateLookup = async () => [];

  it('returns insert_new when no candidates found', async () => {
    const result = await resolveEntity(
      {
        canonical_name: 'john smith',
        name_variants: ['SMITH, JOHN'],
        source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
        external_id: 'H8CA52116',
      },
      emptyLookup,
    );
    expect(result.action).toBe('insert_new');
    expect(result.target_id).toBeNull();
    expect(result.score).toBe(0);
  });

  it('returns insert_new for empty name', async () => {
    const result = await resolveEntity(
      {
        canonical_name: '',
        name_variants: [],
        source_ids: [],
        external_id: '',
      },
      emptyLookup,
    );
    expect(result.action).toBe('insert_new');
  });

  it('returns merge_into when a strong candidate is found', async () => {
    const lookup: CandidateLookup = async () => [
      {
        id: 'existing-uuid-123',
        canonical_name: 'john smith',
        name_variants: ['SMITH, JOHN'],
        source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
      },
    ];

    const result = await resolveEntity(
      {
        canonical_name: 'john smith',
        name_variants: ['SMITH, JOHN A'],
        source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
        external_id: 'H8CA52116',
      },
      lookup,
    );
    expect(result.action).toBe('merge_into');
    expect(result.target_id).toBe('existing-uuid-123');
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.match_details).not.toBeNull();
    expect(result.match_details!.signals.source_id_match).toBe(true);
  });

  it('returns insert_new when candidates are below threshold', async () => {
    const lookup: CandidateLookup = async () => [
      {
        id: 'existing-uuid-123',
        canonical_name: 'completely different name',
        name_variants: ['DIFFERENT, NAME'],
        source_ids: [{ source: 'fec', external_id: 'ZZZZZZZZZ' }],
      },
    ];

    const result = await resolveEntity(
      {
        canonical_name: 'john smith',
        name_variants: ['SMITH, JOHN'],
        source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
        external_id: 'H8CA52116',
      },
      lookup,
    );
    expect(result.action).toBe('insert_new');
    expect(result.target_id).toBeNull();
  });

  it('picks the best match when multiple candidates exist', async () => {
    const lookup: CandidateLookup = async () => [
      {
        id: 'weak-match',
        canonical_name: 'john smithson',
        name_variants: ['SMITHSON, JOHN'],
        source_ids: [],
      },
      {
        id: 'strong-match',
        canonical_name: 'john smith',
        name_variants: ['SMITH, JOHN'],
        source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
      },
    ];

    const result = await resolveEntity(
      {
        canonical_name: 'john smith',
        name_variants: ['SMITH, JOHN'],
        source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
        external_id: 'H8CA52116',
      },
      lookup,
    );
    expect(result.action).toBe('merge_into');
    expect(result.target_id).toBe('strong-match');
  });
});

// ============================================================
// deduplicateBatch
// ============================================================

describe('deduplicateBatch', () => {
  it('processes a batch and calls onDecision for each', async () => {
    const records: FecRecord[] = [
      { CAND_ID: 'H8CA52116', CAND_NAME: 'SMITH, JOHN' },
      { CAND_ID: 'S6NY00001', CAND_NAME: 'DOE, JANE' },
    ];

    const lookup: CandidateLookup = async () => [];
    const decisions: Array<{ action: string }> = [];
    const onDecision = vi.fn(async (decision) => {
      decisions.push(decision);
    });

    const stats = await deduplicateBatch(
      records,
      'candidate',
      lookup,
      onDecision,
    );

    expect(stats.processed).toBe(2);
    expect(stats.inserted).toBe(2);
    expect(stats.merged).toBe(0);
    expect(stats.skipped).toBe(0);
    expect(onDecision).toHaveBeenCalledTimes(2);
  });

  it('skips records with empty names', async () => {
    const records: FecRecord[] = [
      { CAND_ID: 'H8CA52116', CAND_NAME: '' },
      { CAND_ID: 'S6NY00001', CAND_NAME: 'DOE, JANE' },
    ];

    const lookup: CandidateLookup = async () => [];
    const onDecision = vi.fn(async () => {});

    const stats = await deduplicateBatch(records, 'candidate', lookup, onDecision);

    expect(stats.processed).toBe(2);
    expect(stats.skipped).toBe(1);
    expect(stats.inserted).toBe(1);
    expect(onDecision).toHaveBeenCalledTimes(1);
  });

  it('counts merges correctly', async () => {
    const records: FecRecord[] = [
      { CAND_ID: 'H8CA52116', CAND_NAME: 'SMITH, JOHN' },
    ];

    const lookup: CandidateLookup = async () => [
      {
        id: 'existing-uuid',
        canonical_name: 'john smith',
        name_variants: ['SMITH, JOHN'],
        source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
      },
    ];
    const onDecision = vi.fn(async () => {});

    const stats = await deduplicateBatch(records, 'candidate', lookup, onDecision);

    expect(stats.merged).toBe(1);
    expect(stats.inserted).toBe(0);
  });
});
