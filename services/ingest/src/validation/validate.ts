/**
 * Ingestion validation: schema checks on parsed FEC records
 * and anomaly logging for unexpected values.
 *
 * Validates records before they enter the database to catch
 * data quality issues early in the pipeline.
 */

import type { FecRecord } from '../pipelines/fec-parse.js';
import type { FecFileType } from '../pipelines/fec-download.js';

// ============================================================
// TYPES
// ============================================================

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: Severity;
  field: string;
  message: string;
  value: string;
  lineNumber?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface BatchValidationStats {
  total: number;
  valid: number;
  invalid: number;
  warnings: number;
  issues: ValidationIssue[];
}

// ============================================================
// FIELD VALIDATORS
// ============================================================

// FEC candidate IDs: letter + 8 alphanumeric chars, e.g. H8CA52116, S2TX00312, P80000722
const CAND_ID_PATTERN = /^[HPS][0-9A-Z]{8}$/;
const CMTE_ID_PATTERN = /^C\d{8}$/;
const DATE_PATTERN = /^\d{8}$/;
const AMOUNT_PATTERN = /^-?\d+(\.\d+)?$/;

/** Validate a candidate ID (e.g., H8CA52116). */
function validateCandidateId(record: FecRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const candId = record.CAND_ID;
  if (candId && !CAND_ID_PATTERN.test(candId)) {
    issues.push({
      severity: 'warning',
      field: 'CAND_ID',
      message: `Unexpected candidate ID format: ${candId}`,
      value: candId,
    });
  }
  return issues;
}

/** Validate a committee ID (e.g., C00431445). */
function validateCommitteeId(record: FecRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cmteId = record.CMTE_ID;
  if (cmteId && !CMTE_ID_PATTERN.test(cmteId)) {
    issues.push({
      severity: 'warning',
      field: 'CMTE_ID',
      message: `Unexpected committee ID format: ${cmteId}`,
      value: cmteId,
    });
  }
  return issues;
}

/** Validate name field is not empty. */
function validateNamePresent(record: FecRecord, field: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const value = record[field];
  if (!value || value.trim().length === 0) {
    issues.push({
      severity: 'error',
      field,
      message: `Required name field is empty`,
      value: value ?? '',
    });
  }
  return issues;
}

/** Validate a date is in MMDDYYYY format. */
function validateDate(record: FecRecord, field: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const value = record[field];
  if (value && !DATE_PATTERN.test(value)) {
    issues.push({
      severity: 'error',
      field,
      message: `Invalid date format (expected MMDDYYYY): ${value}`,
      value,
    });
  }
  return issues;
}

/** Validate an amount is a valid number. */
function validateAmount(record: FecRecord, field: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const value = record[field];
  if (value && !AMOUNT_PATTERN.test(value.trim())) {
    issues.push({
      severity: 'error',
      field,
      message: `Invalid amount: ${value}`,
      value,
    });
  }
  return issues;
}

/** Validate amendment indicator is N, A, or T. */
function validateAmendmentIndicator(record: FecRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const value = record.AMNDT_IND;
  if (value && !['N', 'A', 'T'].includes(value)) {
    issues.push({
      severity: 'warning',
      field: 'AMNDT_IND',
      message: `Unexpected amendment indicator: ${value}`,
      value,
    });
  }
  return issues;
}

/** Flag anomalously large individual contribution amounts. */
function checkAnomalousAmount(record: FecRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const raw = record.TRANSACTION_AMT;
  if (!raw) return issues;
  const amount = parseFloat(raw);
  if (!isNaN(amount) && Math.abs(amount) > 10_000_000) {
    issues.push({
      severity: 'info',
      field: 'TRANSACTION_AMT',
      message: `Anomalously large amount: ${amount}`,
      value: raw,
    });
  }
  return issues;
}

// ============================================================
// PER-FILE-TYPE VALIDATION
// ============================================================

const VALIDATORS: Record<FecFileType, Array<(record: FecRecord) => ValidationIssue[]>> = {
  cn: [
    validateCandidateId,
    (r) => validateNamePresent(r, 'CAND_NAME'),
  ],
  cm: [
    validateCommitteeId,
    (r) => validateNamePresent(r, 'CMTE_NM'),
  ],
  ccl: [
    validateCandidateId,
    validateCommitteeId,
  ],
  indiv: [
    validateCommitteeId,
    validateAmendmentIndicator,
    (r) => validateDate(r, 'TRANSACTION_DT'),
    (r) => validateAmount(r, 'TRANSACTION_AMT'),
    checkAnomalousAmount,
  ],
  pas2: [
    validateCommitteeId,
    validateAmendmentIndicator,
    (r) => validateDate(r, 'TRANSACTION_DT'),
    (r) => validateAmount(r, 'TRANSACTION_AMT'),
    checkAnomalousAmount,
  ],
  oth: [
    validateCommitteeId,
    validateAmendmentIndicator,
    (r) => validateDate(r, 'TRANSACTION_DT'),
    (r) => validateAmount(r, 'TRANSACTION_AMT'),
    checkAnomalousAmount,
  ],
};

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Validate a single FEC record.
 */
export function validateRecord(
  record: FecRecord,
  fileType: FecFileType,
  lineNumber?: number,
): ValidationResult {
  const validators = VALIDATORS[fileType] ?? [];
  const issues: ValidationIssue[] = [];

  for (const validator of validators) {
    const results = validator(record);
    for (const issue of results) {
      if (lineNumber !== undefined) {
        issue.lineNumber = lineNumber;
      }
      issues.push(issue);
    }
  }

  const valid = !issues.some((i) => i.severity === 'error');
  return { valid, issues };
}

/**
 * Validate a batch of FEC records. Returns aggregate stats and all issues.
 */
export function validateBatch(
  records: FecRecord[],
  fileType: FecFileType,
): BatchValidationStats {
  const stats: BatchValidationStats = {
    total: records.length,
    valid: 0,
    invalid: 0,
    warnings: 0,
    issues: [],
  };

  for (let i = 0; i < records.length; i++) {
    const result = validateRecord(records[i], fileType, i + 1);
    if (result.valid) {
      stats.valid++;
    } else {
      stats.invalid++;
    }
    stats.warnings += result.issues.filter((is) => is.severity === 'warning').length;
    stats.issues.push(...result.issues);
  }

  return stats;
}
