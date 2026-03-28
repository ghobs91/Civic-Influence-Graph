/**
 * FEC bulk file parser.
 * Parses pipe-delimited (`|`) FEC bulk data files into structured records.
 *
 * FEC bulk files have NO header row — column order is defined by the FEC data dictionary.
 * Each file type (cn, cm, ccl, indiv, pas2, oth) has its own column layout.
 *
 * @see https://www.fec.gov/campaign-finance-data/contributions-individuals-file-description/
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { FecFileType } from './fec-download.js';

// ============================================================
// COLUMN DEFINITIONS PER FILE TYPE
// ============================================================

/**
 * cn: Candidate Master File
 * @see https://www.fec.gov/campaign-finance-data/candidate-master-file-description/
 */
export const CN_COLUMNS = [
  'CAND_ID',
  'CAND_NAME',
  'CAND_PTY_AFFILIATION',
  'CAND_ELECTION_YR',
  'CAND_OFFICE_ST',
  'CAND_OFFICE',
  'CAND_OFFICE_DISTRICT',
  'CAND_ICI',
  'CAND_STATUS',
  'CAND_PCC',
  'CAND_ST1',
  'CAND_ST2',
  'CAND_CITY',
  'CAND_ST',
  'CAND_ZIP',
] as const;

/**
 * cm: Committee Master File
 * @see https://www.fec.gov/campaign-finance-data/committee-master-file-description/
 */
export const CM_COLUMNS = [
  'CMTE_ID',
  'CMTE_NM',
  'TRES_NM',
  'CMTE_ST1',
  'CMTE_ST2',
  'CMTE_CITY',
  'CMTE_ST',
  'CMTE_ZIP',
  'CMTE_DSGN',
  'CMTE_TP',
  'CMTE_PTY_AFFILIATION',
  'CMTE_FILING_FREQ',
  'ORG_TP',
  'CONNECTED_ORG_NM',
  'CAND_ID',
] as const;

/**
 * ccl: Candidate-Committee Linkage
 * @see https://www.fec.gov/campaign-finance-data/candidate-committee-linkage-file-description/
 */
export const CCL_COLUMNS = [
  'CAND_ID',
  'CAND_ELECTION_YR',
  'FEC_ELECTION_YR',
  'CMTE_ID',
  'CMTE_TP',
  'CMTE_DSGN',
  'LINKAGE_ID',
] as const;

/**
 * indiv: Individual Contributions
 * @see https://www.fec.gov/campaign-finance-data/contributions-individuals-file-description/
 */
export const INDIV_COLUMNS = [
  'CMTE_ID',
  'AMNDT_IND',
  'RPT_TP',
  'TRANSACTION_PGI',
  'IMAGE_NUM',
  'TRANSACTION_TP',
  'ENTITY_TP',
  'NAME',
  'CITY',
  'STATE',
  'ZIP_CODE',
  'EMPLOYER',
  'OCCUPATION',
  'TRANSACTION_DT',
  'TRANSACTION_AMT',
  'OTHER_ID',
  'TRAN_ID',
  'FILE_NUM',
  'MEMO_CD',
  'MEMO_TEXT',
  'SUB_ID',
] as const;

/**
 * pas2: Committee-to-Committee Contributions (or Candidate)
 * @see https://www.fec.gov/campaign-finance-data/contributions-committees-candidates-file-description/
 */
export const PAS2_COLUMNS = [
  'CMTE_ID',
  'AMNDT_IND',
  'RPT_TP',
  'TRANSACTION_PGI',
  'IMAGE_NUM',
  'TRANSACTION_TP',
  'ENTITY_TP',
  'NAME',
  'CITY',
  'STATE',
  'ZIP_CODE',
  'EMPLOYER',
  'OCCUPATION',
  'TRANSACTION_DT',
  'TRANSACTION_AMT',
  'OTHER_ID',
  'CAND_ID',
  'TRAN_ID',
  'FILE_NUM',
  'MEMO_CD',
  'MEMO_TEXT',
  'SUB_ID',
] as const;

/**
 * oth: Any Transaction from One Committee to Another
 * @see https://www.fec.gov/campaign-finance-data/any-transaction-one-committee-another-file-description/
 */
export const OTH_COLUMNS = [
  'CMTE_ID',
  'AMNDT_IND',
  'RPT_TP',
  'TRANSACTION_PGI',
  'IMAGE_NUM',
  'TRANSACTION_TP',
  'ENTITY_TP',
  'NAME',
  'CITY',
  'STATE',
  'ZIP_CODE',
  'EMPLOYER',
  'OCCUPATION',
  'TRANSACTION_DT',
  'TRANSACTION_AMT',
  'OTHER_ID',
  'TRAN_ID',
  'FILE_NUM',
  'MEMO_CD',
  'MEMO_TEXT',
  'SUB_ID',
] as const;

// ============================================================
// COLUMN HEADER MAP
// ============================================================

export const FEC_COLUMNS: Record<FecFileType, readonly string[]> = {
  cn: CN_COLUMNS,
  cm: CM_COLUMNS,
  ccl: CCL_COLUMNS,
  indiv: INDIV_COLUMNS,
  pas2: PAS2_COLUMNS,
  oth: OTH_COLUMNS,
};

// ============================================================
// PARSED RECORD TYPES
// ============================================================

/** A single parsed FEC record — column name → string value. */
export type FecRecord = Record<string, string>;

export interface ParseProgress {
  fileType: FecFileType;
  linesRead: number;
  linesSkipped: number;
  status: 'parsing' | 'complete' | 'error';
  error?: string;
}

export interface ParseResult {
  fileType: FecFileType;
  records: FecRecord[];
  linesRead: number;
  linesSkipped: number;
}

// ============================================================
// PARSER
// ============================================================

/**
 * Parse a single pipe-delimited line into a keyed record.
 * Returns null if the line has an unexpected number of fields.
 */
export function parseLine(line: string, columns: readonly string[]): FecRecord | null {
  const fields = line.split('|');
  // FEC files sometimes have a trailing pipe, giving one extra empty field
  if (fields.length < columns.length) {
    return null;
  }

  const record: FecRecord = {};
  for (let i = 0; i < columns.length; i++) {
    record[columns[i]] = fields[i].trim();
  }
  return record;
}

/**
 * Stream-parse an FEC bulk data file. Reads line-by-line to handle
 * multi-gigabyte files (e.g. indiv) without loading everything into memory.
 *
 * @param filePath - Path to the unzipped pipe-delimited text file
 * @param fileType - FEC file type to determine column layout
 * @param onRecord - Callback invoked for each successfully parsed record
 * @param onProgress - Optional progress callback
 * @returns Parse summary with counts
 */
export async function parseFile(
  filePath: string,
  fileType: FecFileType,
  onRecord: (record: FecRecord, lineNumber: number) => void,
  onProgress?: (progress: ParseProgress) => void,
): Promise<{ linesRead: number; linesSkipped: number }> {
  const columns = FEC_COLUMNS[fileType];
  let linesRead = 0;
  let linesSkipped = 0;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    linesRead++;

    // Skip empty lines
    if (line.trim().length === 0) {
      linesSkipped++;
      continue;
    }

    const record = parseLine(line, columns);
    if (record === null) {
      linesSkipped++;
      continue;
    }

    onRecord(record, linesRead);

    // Report progress every 100k lines
    if (linesRead % 100_000 === 0) {
      onProgress?.({ fileType, linesRead, linesSkipped, status: 'parsing' });
    }
  }

  onProgress?.({ fileType, linesRead, linesSkipped, status: 'complete' });
  return { linesRead, linesSkipped };
}

/**
 * Parse an entire FEC file into memory. Suitable for smaller files
 * (cn, cm, ccl). For large files (indiv, pas2, oth), use parseFile()
 * with a streaming callback instead.
 */
export async function parseFileToArray(
  filePath: string,
  fileType: FecFileType,
  onProgress?: (progress: ParseProgress) => void,
): Promise<ParseResult> {
  const records: FecRecord[] = [];

  const { linesRead, linesSkipped } = await parseFile(
    filePath,
    fileType,
    (record) => records.push(record),
    onProgress,
  );

  return { fileType, records, linesRead, linesSkipped };
}

// ============================================================
// FEC DATE PARSING
// ============================================================

/**
 * Parse FEC date format (MMDDYYYY) to ISO date string (YYYY-MM-DD).
 * Returns null for empty or malformed dates.
 */
export function parseFecDate(raw: string): string | null {
  if (!raw || raw.length !== 8) return null;
  const mm = raw.slice(0, 2);
  const dd = raw.slice(2, 4);
  const yyyy = raw.slice(4, 8);
  // Basic validation
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  const year = parseInt(yyyy, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse FEC transaction amount to a number.
 * FEC amounts can be negative (refunds). Returns null for empty/invalid.
 */
export function parseFecAmount(raw: string): number | null {
  if (!raw || raw.trim().length === 0) return null;
  const num = parseFloat(raw);
  if (isNaN(num)) return null;
  return num;
}

// ============================================================
// TRANSACTION TYPE MAPPING
// ============================================================

/**
 * Maps raw FEC TRANSACTION_TP codes to semantic categories.
 * @see https://www.fec.gov/campaign-finance-data/transaction-type-code-descriptions/
 */
const TRANSACTION_TYPE_MAP: Record<string, string> = {
  // Individual contributions
  '15': 'direct_contribution',
  '15E': 'earmark',
  '15J': 'joint_fundraising_contribution',
  '22Y': 'refund',
  '22Z': 'refund',
  // Committee contributions
  '24A': 'independent_expenditure_against',
  '24C': 'coordinated_expenditure',
  '24E': 'independent_expenditure_for',
  '24F': 'direct_contribution',
  '24G': 'transfer',
  '24K': 'direct_contribution',
  '24N': 'transfer',
  '24T': 'earmark',
  '24U': 'earmark',
  '24R': 'redesignation',
  // Other
  '10': 'direct_contribution',
  '10J': 'joint_fundraising_transfer',
  '11': 'tribal_contribution',
  '12': 'direct_contribution',
  '13': 'direct_contribution',
  '15C': 'direct_contribution',
  '16C': 'loan',
  '16F': 'loan',
  '16G': 'loan',
  '16J': 'loan',
  '17': 'direct_contribution',
  '18G': 'transfer',
  '18J': 'transfer',
  '18K': 'transfer',
  '18U': 'transfer',
  '19': 'direct_contribution',
  '19J': 'joint_fundraising_transfer',
  '20': 'fundraising_disbursement',
  '20A': 'fundraising_disbursement',
  '20C': 'fundraising_disbursement',
  '20Y': 'refund',
  '21Y': 'refund',
  '22': 'refund',
  '30': 'convention_expenditure',
  '30T': 'convention_expenditure',
  '31': 'convention_expenditure',
  '31T': 'convention_expenditure',
  '32': 'convention_expenditure',
  '32T': 'convention_expenditure',
  '40': 'convention_expenditure',
  '40T': 'convention_expenditure',
  '40Y': 'convention_expenditure',
  '40Z': 'convention_expenditure',
  '41': 'convention_expenditure',
  '41T': 'convention_expenditure',
  '41Y': 'convention_expenditure',
  '41Z': 'convention_expenditure',
  '42': 'convention_expenditure',
  '42T': 'convention_expenditure',
  '42Y': 'convention_expenditure',
  '42Z': 'convention_expenditure',
};

/**
 * Map a raw FEC TRANSACTION_TP code to a semantic category.
 * Returns 'other' for unrecognized codes.
 */
export function mapTransactionType(fecCode: string): string {
  return TRANSACTION_TYPE_MAP[fecCode] ?? 'other';
}

// ============================================================
// FEC COMMITTEE TYPE MAPPING
// ============================================================

/**
 * Maps FEC CMTE_TP code to our internal committee_type enum.
 * @see https://www.fec.gov/campaign-finance-data/committee-type-code-descriptions/
 */
const COMMITTEE_TYPE_MAP: Record<string, string> = {
  'C': 'candidate',            // Communication cost
  'D': 'other',                // Delegate committee
  'E': 'other',                // Electioneering communication
  'H': 'candidate',            // House campaign
  'I': 'other',                // Independent expenditure (person)
  'N': 'pac',                  // PAC - Nonqualified
  'O': 'super_pac',            // Super PAC (Independent Expenditure-Only)
  'P': 'candidate',            // Presidential campaign
  'Q': 'pac',                  // PAC - Qualified
  'S': 'candidate',            // Senate campaign
  'U': 'joint_fundraising',    // Single candidate joint fundraising
  'V': 'joint_fundraising',    // Multi-candidate joint fundraising  
  'W': 'super_pac',            // Super PAC (Hybrid)
  'X': 'party',                // Party - Nonqualified
  'Y': 'party',                // Party - Qualified
  'Z': 'party',                // National party nonfederal
};

/**
 * Map an FEC CMTE_TP code to an internal committee type.
 */
export function mapCommitteeType(fecCode: string): string {
  return COMMITTEE_TYPE_MAP[fecCode] ?? 'other';
}

/**
 * Maps FEC CAND_OFFICE code to a readable office.
 */
export function mapCandidateOffice(officeCode: string): string {
  switch (officeCode) {
    case 'H': return 'representative';
    case 'S': return 'senator';
    case 'P': return 'president';
    default: return officeCode;
  }
}
