import { describe, it, expect } from 'vitest';
import {
  buildTransactionKey,
  buildAmendmentChains,
  resolveAmendmentChains,
  filterToCanonical,
  buildAmendmentChainMetadata,
} from '../pipelines/fec-amendments.js';
import type { FecRecord } from '../pipelines/fec-parse.js';

// ============================================================
// buildTransactionKey
// ============================================================

describe('buildTransactionKey', () => {
  it('combines CMTE_ID and TRAN_ID', () => {
    const record: FecRecord = { CMTE_ID: 'C00431445', TRAN_ID: 'SA11A' };
    expect(buildTransactionKey(record)).toBe('C00431445|SA11A');
  });

  it('falls back to SUB_ID when TRAN_ID is missing', () => {
    const record: FecRecord = { CMTE_ID: 'C00431445', SUB_ID: '123456' };
    expect(buildTransactionKey(record)).toBe('C00431445|123456');
  });

  it('handles missing fields', () => {
    const record: FecRecord = {};
    expect(buildTransactionKey(record)).toBe('|');
  });
});

// ============================================================
// buildAmendmentChains
// ============================================================

describe('buildAmendmentChains', () => {
  it('groups records with the same transaction key', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'A', FILE_NUM: '200' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX2', AMNDT_IND: 'N', FILE_NUM: '100' },
    ];

    const chains = buildAmendmentChains(records);
    expect(chains.size).toBe(2);
    expect(chains.get('C001|TX1')!.filings.length).toBe(2);
    expect(chains.get('C001|TX2')!.filings.length).toBe(1);
  });

  it('sorts filings by FILE_NUM ascending', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'A', FILE_NUM: '300' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'A', FILE_NUM: '200' },
    ];

    const chains = buildAmendmentChains(records);
    const chain = chains.get('C001|TX1')!;
    expect(chain.filings[0].file_num).toBe('100');
    expect(chain.filings[1].file_num).toBe('200');
    expect(chain.filings[2].file_num).toBe('300');
  });
});

// ============================================================
// resolveAmendmentChains
// ============================================================

describe('resolveAmendmentChains', () => {
  it('single filing is canonical', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '500' },
    ];

    const result = resolveAmendmentChains(records);
    expect(result.canonical.length).toBe(1);
    expect(result.canonical[0].TRANSACTION_AMT).toBe('500');
    expect(result.superseded.length).toBe(0);
    expect(result.terminated.length).toBe(0);
  });

  it('latest amendment becomes canonical; earlier are superseded', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '500' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'A', FILE_NUM: '200', TRANSACTION_AMT: '750' },
    ];

    const result = resolveAmendmentChains(records);
    expect(result.canonical.length).toBe(1);
    expect(result.canonical[0].TRANSACTION_AMT).toBe('750');
    expect(result.superseded.length).toBe(1);
    expect(result.superseded[0].TRANSACTION_AMT).toBe('500');
  });

  it('three amendments: latest wins, two superseded', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '500' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'A', FILE_NUM: '200', TRANSACTION_AMT: '750' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'A', FILE_NUM: '300', TRANSACTION_AMT: '800' },
    ];

    const result = resolveAmendmentChains(records);
    expect(result.canonical.length).toBe(1);
    expect(result.canonical[0].TRANSACTION_AMT).toBe('800');
    expect(result.superseded.length).toBe(2);
  });

  it('terminated filing chains: all go to terminated list', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '500' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'T', FILE_NUM: '200', TRANSACTION_AMT: '0' },
    ];

    const result = resolveAmendmentChains(records);
    expect(result.canonical.length).toBe(0);
    expect(result.superseded.length).toBe(0);
    expect(result.terminated.length).toBe(2);
    expect(result.chains[0].isTerminated).toBe(true);
    expect(result.chains[0].canonical).toBeNull();
  });

  it('handles multiple independent transaction chains', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '100' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX2', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '200' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX2', AMNDT_IND: 'A', FILE_NUM: '200', TRANSACTION_AMT: '250' },
    ];

    const result = resolveAmendmentChains(records);
    expect(result.canonical.length).toBe(2);
    expect(result.superseded.length).toBe(1);
  });
});

// ============================================================
// filterToCanonical
// ============================================================

describe('filterToCanonical', () => {
  it('returns only canonical records', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '500' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'A', FILE_NUM: '200', TRANSACTION_AMT: '750' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX2', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '300' },
    ];

    const canonical = filterToCanonical(records);
    expect(canonical.length).toBe(2);
    const amounts = canonical.map((r) => r.TRANSACTION_AMT).sort();
    expect(amounts).toEqual(['300', '750']);
  });

  it('excludes terminated transactions', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_AMT: '500' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'T', FILE_NUM: '200', TRANSACTION_AMT: '0' },
    ];

    const canonical = filterToCanonical(records);
    expect(canonical.length).toBe(0);
  });
});

// ============================================================
// buildAmendmentChainMetadata
// ============================================================

describe('buildAmendmentChainMetadata', () => {
  it('builds metadata array from a chain', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'N', FILE_NUM: '100', TRANSACTION_DT: '01152024' },
      { CMTE_ID: 'C001', TRAN_ID: 'TX1', AMNDT_IND: 'A', FILE_NUM: '200', TRANSACTION_DT: '02152024' },
    ];

    const chains = resolveAmendmentChains(records).chains;
    const metadata = buildAmendmentChainMetadata(chains[0]);
    expect(metadata).toEqual([
      { filing_id: '100', amendment_indicator: 'N', date: '01152024' },
      { filing_id: '200', amendment_indicator: 'A', date: '02152024' },
    ]);
  });
});
