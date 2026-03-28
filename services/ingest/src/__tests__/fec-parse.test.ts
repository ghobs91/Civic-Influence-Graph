import { describe, it, expect } from 'vitest';
import {
  parseLine,
  parseFecDate,
  parseFecAmount,
  mapTransactionType,
  mapCommitteeType,
  mapCandidateOffice,
  FEC_COLUMNS,
  CN_COLUMNS,
  CM_COLUMNS,
  CCL_COLUMNS,
  INDIV_COLUMNS,
  PAS2_COLUMNS,
  OTH_COLUMNS,
} from '../pipelines/fec-parse.js';

// ============================================================
// parseLine
// ============================================================

describe('parseLine', () => {
  it('parses a pipe-delimited cn line into a keyed record', () => {
    const line = 'H8CA52116|SMITH, JOHN A|REP|2024|CA|H|52|I|C|C00123456|123 MAIN ST||LOS ANGELES|CA|90001';
    const result = parseLine(line, CN_COLUMNS);
    expect(result).not.toBeNull();
    expect(result!.CAND_ID).toBe('H8CA52116');
    expect(result!.CAND_NAME).toBe('SMITH, JOHN A');
    expect(result!.CAND_PTY_AFFILIATION).toBe('REP');
    expect(result!.CAND_ELECTION_YR).toBe('2024');
    expect(result!.CAND_OFFICE).toBe('H');
    expect(result!.CAND_OFFICE_DISTRICT).toBe('52');
    expect(result!.CAND_ZIP).toBe('90001');
  });

  it('parses a cm line correctly', () => {
    const line = 'C00431445|SMITH FOR CONGRESS|JOHN TREASURER|123 ST||WASHINGTON|DC|20001|P|H|REP|Q|C|ACME CORP|H8CA52116';
    const result = parseLine(line, CM_COLUMNS);
    expect(result).not.toBeNull();
    expect(result!.CMTE_ID).toBe('C00431445');
    expect(result!.CMTE_NM).toBe('SMITH FOR CONGRESS');
    expect(result!.TRES_NM).toBe('JOHN TREASURER');
    expect(result!.CMTE_DSGN).toBe('P');
    expect(result!.CMTE_TP).toBe('H');
    expect(result!.CAND_ID).toBe('H8CA52116');
  });

  it('parses an individual contribution line (indiv)', () => {
    const line = 'C00431445|N|Q2|P|123456789|15|IND|DOE, JOHN|NEW YORK|NY|10001|ACME INC|SOFTWARE ENGINEER|06152024|2800|C00654321|SA11A|12345|X|EARMARKED FOR SMITH|4123456789';
    const result = parseLine(line, INDIV_COLUMNS);
    expect(result).not.toBeNull();
    expect(result!.CMTE_ID).toBe('C00431445');
    expect(result!.AMNDT_IND).toBe('N');
    expect(result!.TRANSACTION_TP).toBe('15');
    expect(result!.NAME).toBe('DOE, JOHN');
    expect(result!.EMPLOYER).toBe('ACME INC');
    expect(result!.OCCUPATION).toBe('SOFTWARE ENGINEER');
    expect(result!.TRANSACTION_DT).toBe('06152024');
    expect(result!.TRANSACTION_AMT).toBe('2800');
    expect(result!.SUB_ID).toBe('4123456789');
    expect(result!.MEMO_CD).toBe('X');
  });

  it('returns null if line has fewer columns than expected', () => {
    const line = 'H8CA52116|SMITH, JOHN A';
    const result = parseLine(line, CN_COLUMNS);
    expect(result).toBeNull();
  });

  it('handles trailing pipe (extra empty field)', () => {
    const line = 'H8CA52116|SMITH, JOHN A|REP|2024|CA|H|52|I|C|C00123456|123 MAIN ST||LOS ANGELES|CA|90001|';
    const result = parseLine(line, CN_COLUMNS);
    expect(result).not.toBeNull();
    expect(result!.CAND_ID).toBe('H8CA52116');
    expect(result!.CAND_ZIP).toBe('90001');
  });

  it('trims whitespace from field values', () => {
    const line = ' H8CA52116 | SMITH, JOHN A |REP|2024|CA|H|52|I|C|C00123456|123 ST||LA|CA|90001';
    const result = parseLine(line, CN_COLUMNS);
    expect(result).not.toBeNull();
    expect(result!.CAND_ID).toBe('H8CA52116');
    expect(result!.CAND_NAME).toBe('SMITH, JOHN A');
  });

  it('handles empty fields gracefully', () => {
    const line = 'H8CA52116|SMITH, JOHN A||2024||H|52|I|C|C00123456|||LOS ANGELES|CA|90001';
    const result = parseLine(line, CN_COLUMNS);
    expect(result).not.toBeNull();
    expect(result!.CAND_PTY_AFFILIATION).toBe('');
    expect(result!.CAND_OFFICE_ST).toBe('');
    expect(result!.CAND_ST1).toBe('');
    expect(result!.CAND_ST2).toBe('');
  });
});

// ============================================================
// Column definitions
// ============================================================

describe('FEC_COLUMNS', () => {
  it('has all 6 file types', () => {
    expect(Object.keys(FEC_COLUMNS)).toEqual(['cn', 'cm', 'ccl', 'indiv', 'pas2', 'oth']);
  });

  it('cn has 15 columns', () => {
    expect(CN_COLUMNS.length).toBe(15);
  });

  it('cm has 15 columns', () => {
    expect(CM_COLUMNS.length).toBe(15);
  });

  it('ccl has 7 columns', () => {
    expect(CCL_COLUMNS.length).toBe(7);
  });

  it('indiv has 21 columns', () => {
    expect(INDIV_COLUMNS.length).toBe(21);
  });

  it('pas2 has 22 columns', () => {
    expect(PAS2_COLUMNS.length).toBe(22);
  });

  it('oth has 21 columns', () => {
    expect(OTH_COLUMNS.length).toBe(21);
  });
});

// ============================================================
// parseFecDate
// ============================================================

describe('parseFecDate', () => {
  it('parses MMDDYYYY to YYYY-MM-DD', () => {
    expect(parseFecDate('06152024')).toBe('2024-06-15');
  });

  it('parses January 1 boundary', () => {
    expect(parseFecDate('01012020')).toBe('2020-01-01');
  });

  it('parses December 31 boundary', () => {
    expect(parseFecDate('12312024')).toBe('2024-12-31');
  });

  it('returns null for empty string', () => {
    expect(parseFecDate('')).toBeNull();
  });

  it('returns null for wrong length', () => {
    expect(parseFecDate('0615202')).toBeNull();
    expect(parseFecDate('061520245')).toBeNull();
  });

  it('returns null for invalid month', () => {
    expect(parseFecDate('13012024')).toBeNull();
    expect(parseFecDate('00012024')).toBeNull();
  });

  it('returns null for invalid day', () => {
    expect(parseFecDate('01322024')).toBeNull();
    expect(parseFecDate('01002024')).toBeNull();
  });

  it('returns null for year out of range', () => {
    expect(parseFecDate('01011899')).toBeNull();
    expect(parseFecDate('01012101')).toBeNull();
  });
});

// ============================================================
// parseFecAmount
// ============================================================

describe('parseFecAmount', () => {
  it('parses a positive amount', () => {
    expect(parseFecAmount('2800')).toBe(2800);
  });

  it('parses a decimal amount', () => {
    expect(parseFecAmount('2800.50')).toBe(2800.5);
  });

  it('parses a negative amount (refund)', () => {
    expect(parseFecAmount('-500')).toBe(-500);
  });

  it('returns null for empty string', () => {
    expect(parseFecAmount('')).toBeNull();
  });

  it('returns null for whitespace', () => {
    expect(parseFecAmount('   ')).toBeNull();
  });

  it('returns null for non-numeric', () => {
    expect(parseFecAmount('abc')).toBeNull();
  });

  it('parses zero', () => {
    expect(parseFecAmount('0')).toBe(0);
  });
});

// ============================================================
// mapTransactionType
// ============================================================

describe('mapTransactionType', () => {
  it('maps 15 to direct_contribution', () => {
    expect(mapTransactionType('15')).toBe('direct_contribution');
  });

  it('maps 15E to earmark', () => {
    expect(mapTransactionType('15E')).toBe('earmark');
  });

  it('maps 24K to direct_contribution', () => {
    expect(mapTransactionType('24K')).toBe('direct_contribution');
  });

  it('maps 24E to independent_expenditure_for', () => {
    expect(mapTransactionType('24E')).toBe('independent_expenditure_for');
  });

  it('maps 22Y to refund', () => {
    expect(mapTransactionType('22Y')).toBe('refund');
  });

  it('returns other for unrecognized code', () => {
    expect(mapTransactionType('99X')).toBe('other');
  });

  it('returns other for empty string', () => {
    expect(mapTransactionType('')).toBe('other');
  });
});

// ============================================================
// mapCommitteeType
// ============================================================

describe('mapCommitteeType', () => {
  it('maps H to candidate', () => {
    expect(mapCommitteeType('H')).toBe('candidate');
  });

  it('maps S to candidate', () => {
    expect(mapCommitteeType('S')).toBe('candidate');
  });

  it('maps P to candidate', () => {
    expect(mapCommitteeType('P')).toBe('candidate');
  });

  it('maps N to pac', () => {
    expect(mapCommitteeType('N')).toBe('pac');
  });

  it('maps O to super_pac', () => {
    expect(mapCommitteeType('O')).toBe('super_pac');
  });

  it('maps X to party', () => {
    expect(mapCommitteeType('X')).toBe('party');
  });

  it('maps U to joint_fundraising', () => {
    expect(mapCommitteeType('U')).toBe('joint_fundraising');
  });

  it('returns other for unrecognized code', () => {
    expect(mapCommitteeType('Z')).toBe('party');
    expect(mapCommitteeType('?')).toBe('other');
  });
});

// ============================================================
// mapCandidateOffice
// ============================================================

describe('mapCandidateOffice', () => {
  it('maps H to representative', () => {
    expect(mapCandidateOffice('H')).toBe('representative');
  });

  it('maps S to senator', () => {
    expect(mapCandidateOffice('S')).toBe('senator');
  });

  it('maps P to president', () => {
    expect(mapCandidateOffice('P')).toBe('president');
  });

  it('returns raw code for unknown', () => {
    expect(mapCandidateOffice('X')).toBe('X');
  });
});
