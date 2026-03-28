/**
 * FEC amendment chain resolver.
 *
 * FEC filings use AMNDT_IND to indicate amendment status:
 * - N: New (original filing)
 * - A: Amendment (replaces a prior filing)
 * - T: Termination
 *
 * Multiple amendments may reference the same original filing via FILE_NUM.
 * This module:
 * 1. Groups records by TRAN_ID + CMTE_ID (the natural key for a transaction)
 * 2. Builds amendment chains ordered by FILE_NUM
 * 3. Promotes the latest non-terminated filing as canonical
 * 4. Marks superseded filings for exclusion from aggregation
 */

import type { FecRecord } from './fec-parse.js';

// ============================================================
// TYPES
// ============================================================

export interface AmendmentEntry {
  filing_id: string;
  amendment_indicator: string;
  file_num: string;
  record: FecRecord;
}

export interface AmendmentChain {
  /** Natural key: CMTE_ID|TRAN_ID */
  transactionKey: string;
  /** All filings for this transaction, ordered by FILE_NUM ascending */
  filings: AmendmentEntry[];
  /** The canonical (latest non-terminated) filing, or null if terminated */
  canonical: AmendmentEntry | null;
  /** Whether the transaction chain has been terminated */
  isTerminated: boolean;
}

export interface AmendmentResolution {
  /** Records to use as the canonical version (one per transaction key) */
  canonical: FecRecord[];
  /** Records that were superseded by amendments and should be excluded */
  superseded: FecRecord[];
  /** Records for terminated transactions */
  terminated: FecRecord[];
  /** Amendment chain metadata for audit trail */
  chains: AmendmentChain[];
}

// ============================================================
// CHAIN BUILDING
// ============================================================

/**
 * Build a unique transaction key from a record.
 * Uses CMTE_ID + TRAN_ID as the natural key for grouping amendments.
 * Falls back to SUB_ID if TRAN_ID is absent.
 */
export function buildTransactionKey(record: FecRecord): string {
  const cmteId = record.CMTE_ID || '';
  const tranId = record.TRAN_ID || record.SUB_ID || '';
  return `${cmteId}|${tranId}`;
}

/**
 * Group FEC records into amendment chains.
 * Records sharing the same transaction key are grouped together
 * and sorted by FILE_NUM ascending (earliest filing first).
 */
export function buildAmendmentChains(records: FecRecord[]): Map<string, AmendmentChain> {
  const chains = new Map<string, AmendmentChain>();

  for (const record of records) {
    const key = buildTransactionKey(record);
    const entry: AmendmentEntry = {
      filing_id: record.FILE_NUM || '',
      amendment_indicator: record.AMNDT_IND || 'N',
      file_num: record.FILE_NUM || '',
      record,
    };

    let chain = chains.get(key);
    if (!chain) {
      chain = {
        transactionKey: key,
        filings: [],
        canonical: null,
        isTerminated: false,
      };
      chains.set(key, chain);
    }
    chain.filings.push(entry);
  }

  // Sort each chain's filings by FILE_NUM ascending
  for (const chain of chains.values()) {
    chain.filings.sort((a, b) => {
      const numA = parseInt(a.file_num, 10) || 0;
      const numB = parseInt(b.file_num, 10) || 0;
      return numA - numB;
    });
  }

  return chains;
}

// ============================================================
// RESOLUTION
// ============================================================

/**
 * Resolve amendment chains: identify canonical records, superseded records,
 * and terminated transactions.
 */
export function resolveAmendmentChains(records: FecRecord[]): AmendmentResolution {
  const chainMap = buildAmendmentChains(records);

  const canonical: FecRecord[] = [];
  const superseded: FecRecord[] = [];
  const terminated: FecRecord[] = [];
  const chains: AmendmentChain[] = [];

  for (const chain of chainMap.values()) {
    // Check if any filing is a termination
    const hasTermination = chain.filings.some(
      (f) => f.amendment_indicator === 'T'
    );

    if (hasTermination) {
      chain.isTerminated = true;
      chain.canonical = null;
      // All filings in a terminated chain go to terminated
      for (const filing of chain.filings) {
        terminated.push(filing.record);
      }
    } else if (chain.filings.length === 1) {
      // Single filing — it's the canonical version
      chain.canonical = chain.filings[0];
      canonical.push(chain.filings[0].record);
    } else {
      // Multiple filings — latest (highest FILE_NUM) is canonical
      const latest = chain.filings[chain.filings.length - 1];
      chain.canonical = latest;
      canonical.push(latest.record);

      // All earlier filings are superseded
      for (let i = 0; i < chain.filings.length - 1; i++) {
        superseded.push(chain.filings[i].record);
      }
    }

    chains.push(chain);
  }

  return { canonical, superseded, terminated, chains };
}

/**
 * Build an amendment chain metadata array for a single record,
 * suitable for storage in the donation.amendment_chain JSONB field.
 */
export function buildAmendmentChainMetadata(
  chain: AmendmentChain
): Array<{ filing_id: string; amendment_indicator: string; date: string }> {
  return chain.filings.map((f) => ({
    filing_id: f.filing_id,
    amendment_indicator: f.amendment_indicator,
    date: f.record.TRANSACTION_DT || '',
  }));
}

/**
 * Filter a list of FEC records to only canonical versions,
 * resolving all amendment chains. Convenience wrapper around
 * resolveAmendmentChains that returns just the usable records.
 */
export function filterToCanonical(records: FecRecord[]): FecRecord[] {
  const resolution = resolveAmendmentChains(records);
  return resolution.canonical;
}
