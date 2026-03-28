import { describe, it, expect } from 'vitest';
import {
  validateRecord,
  validateBatch,
  type ValidationResult,
  type BatchValidationStats,
} from '../validation/validate.js';
import type { FecRecord } from '../pipelines/fec-parse.js';

describe('validateRecord', () => {
  describe('cn (candidate master)', () => {
    it('should pass a valid candidate record', () => {
      const record: FecRecord = { CAND_ID: 'H8CA52116', CAND_NAME: 'PELOSI, NANCY' };
      const result = validateRecord(record, 'cn');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should error on missing candidate name', () => {
      const record: FecRecord = { CAND_ID: 'H8CA52116', CAND_NAME: '' };
      const result = validateRecord(record, 'cn');
      expect(result.valid).toBe(false);
      expect(result.issues[0].severity).toBe('error');
      expect(result.issues[0].field).toBe('CAND_NAME');
    });

    it('should warn on badly formatted candidate ID', () => {
      const record: FecRecord = { CAND_ID: 'BADID', CAND_NAME: 'DOE, JOHN' };
      const result = validateRecord(record, 'cn');
      expect(result.valid).toBe(true); // warnings don't block
      expect(result.issues[0].severity).toBe('warning');
      expect(result.issues[0].field).toBe('CAND_ID');
    });

    it('should pass when CAND_ID is absent', () => {
      const record: FecRecord = { CAND_NAME: 'DOE, JOHN' };
      const result = validateRecord(record, 'cn');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('cm (committee master)', () => {
    it('should pass a valid committee record', () => {
      const record: FecRecord = { CMTE_ID: 'C00431445', CMTE_NM: 'ACTBLUE' };
      const result = validateRecord(record, 'cm');
      expect(result.valid).toBe(true);
    });

    it('should error on empty committee name', () => {
      const record: FecRecord = { CMTE_ID: 'C00431445', CMTE_NM: '  ' };
      const result = validateRecord(record, 'cm');
      expect(result.valid).toBe(false);
      expect(result.issues[0].field).toBe('CMTE_NM');
    });

    it('should warn on bad committee ID format', () => {
      const record: FecRecord = { CMTE_ID: 'NOTVALID', CMTE_NM: 'ACTBLUE' };
      const result = validateRecord(record, 'cm');
      expect(result.issues[0].severity).toBe('warning');
    });
  });

  describe('ccl (candidate-committee linkage)', () => {
    it('should pass valid linkage record', () => {
      const record: FecRecord = { CAND_ID: 'H8CA52116', CMTE_ID: 'C00431445' };
      const result = validateRecord(record, 'ccl');
      expect(result.valid).toBe(true);
    });

    it('should warn on bad IDs', () => {
      const record: FecRecord = { CAND_ID: 'BAD', CMTE_ID: 'BAD' };
      const result = validateRecord(record, 'ccl');
      expect(result.issues).toHaveLength(2);
      expect(result.issues.every((i) => i.severity === 'warning')).toBe(true);
    });
  });

  describe('indiv (individual contributions)', () => {
    it('should pass a valid contribution record', () => {
      const record: FecRecord = {
        CMTE_ID: 'C00431445',
        AMNDT_IND: 'N',
        TRANSACTION_DT: '06302024',
        TRANSACTION_AMT: '2500.00',
      };
      const result = validateRecord(record, 'indiv');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should error on invalid date format', () => {
      const record: FecRecord = {
        CMTE_ID: 'C00431445',
        AMNDT_IND: 'N',
        TRANSACTION_DT: '2024-06-30',
        TRANSACTION_AMT: '100',
      };
      const result = validateRecord(record, 'indiv');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === 'TRANSACTION_DT')).toBe(true);
    });

    it('should error on non-numeric amount', () => {
      const record: FecRecord = {
        CMTE_ID: 'C00431445',
        AMNDT_IND: 'N',
        TRANSACTION_DT: '06302024',
        TRANSACTION_AMT: 'abc',
      };
      const result = validateRecord(record, 'indiv');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.field === 'TRANSACTION_AMT')).toBe(true);
    });

    it('should warn on unexpected amendment indicator', () => {
      const record: FecRecord = {
        CMTE_ID: 'C00431445',
        AMNDT_IND: 'X',
        TRANSACTION_DT: '06302024',
        TRANSACTION_AMT: '100',
      };
      const result = validateRecord(record, 'indiv');
      expect(result.valid).toBe(true);
      expect(result.issues.some((i) => i.field === 'AMNDT_IND')).toBe(true);
    });

    it('should flag anomalously large amounts as info', () => {
      const record: FecRecord = {
        CMTE_ID: 'C00431445',
        AMNDT_IND: 'N',
        TRANSACTION_DT: '06302024',
        TRANSACTION_AMT: '50000000',
      };
      const result = validateRecord(record, 'indiv');
      expect(result.valid).toBe(true);
      expect(result.issues.some((i) => i.severity === 'info')).toBe(true);
    });

    it('should accept negative amounts', () => {
      const record: FecRecord = {
        CMTE_ID: 'C00431445',
        AMNDT_IND: 'N',
        TRANSACTION_DT: '06302024',
        TRANSACTION_AMT: '-500.00',
      };
      const result = validateRecord(record, 'indiv');
      expect(result.valid).toBe(true);
    });

    it('should skip validation on missing optional fields', () => {
      const record: FecRecord = { CMTE_ID: 'C00431445' };
      const result = validateRecord(record, 'indiv');
      expect(result.valid).toBe(true);
    });
  });

  describe('line numbers', () => {
    it('should attach line number to issues when provided', () => {
      const record: FecRecord = { CMTE_ID: 'BAD', CMTE_NM: '' };
      const result = validateRecord(record, 'cm', 42);
      expect(result.issues.every((i) => i.lineNumber === 42)).toBe(true);
    });
  });
});

describe('validateBatch', () => {
  it('should compute aggregate stats for a batch', () => {
    const records: FecRecord[] = [
      { CAND_ID: 'H8CA52116', CAND_NAME: 'PELOSI, NANCY' }, // valid
      { CAND_ID: 'BAD', CAND_NAME: 'DOE, JOHN' }, // warning only (still valid)
      { CAND_ID: 'H0AK00097', CAND_NAME: '' }, // error (invalid)
    ];
    const stats = validateBatch(records, 'cn');
    expect(stats.total).toBe(3);
    expect(stats.valid).toBe(2);
    expect(stats.invalid).toBe(1);
    expect(stats.warnings).toBe(1);
    expect(stats.issues.length).toBeGreaterThan(0);
  });

  it('should handle an empty batch', () => {
    const stats = validateBatch([], 'cn');
    expect(stats.total).toBe(0);
    expect(stats.valid).toBe(0);
    expect(stats.invalid).toBe(0);
  });

  it('should assign sequential line numbers', () => {
    const records: FecRecord[] = [
      { CMTE_ID: 'BAD', CMTE_NM: '' },
      { CMTE_ID: 'ALSOBAD', CMTE_NM: '' },
    ];
    const stats = validateBatch(records, 'cm');
    const lineNumbers = stats.issues.map((i) => i.lineNumber);
    expect(lineNumbers).toContain(1);
    expect(lineNumbers).toContain(2);
  });
});
