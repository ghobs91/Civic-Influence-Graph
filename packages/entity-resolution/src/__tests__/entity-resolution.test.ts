import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  normalizeNameOrder,
  levenshteinDistance,
  nameSimilarity,
  tokenOverlap,
  hasMatchingSourceId,
  scoreMatch,
  findMatches,
} from '../index.js';

describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeName('Jane A. Smith')).toBe('jane a smith');
  });

  it('removes prefixes', () => {
    expect(normalizeName('Dr. Jane Smith')).toBe('jane smith');
    expect(normalizeName('Sen. John Doe')).toBe('john doe');
    expect(normalizeName('Rep. Mary Johnson')).toBe('mary johnson');
  });

  it('removes suffixes', () => {
    expect(normalizeName('John Smith Jr.')).toBe('john smith');
    expect(normalizeName('Jane Doe III')).toBe('jane doe');
  });

  it('collapses whitespace', () => {
    expect(normalizeName('  Jane   Smith  ')).toBe('jane smith');
  });
});

describe('normalizeNameOrder', () => {
  it('converts LAST, FIRST to FIRST LAST', () => {
    expect(normalizeNameOrder('SMITH, JANE A.')).toBe('jane a smith');
  });

  it('handles names without commas', () => {
    expect(normalizeNameOrder('Jane Smith')).toBe('jane smith');
  });
});

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('returns correct distance for single edit', () => {
    expect(levenshteinDistance('abc', 'abd')).toBe(1);
  });

  it('returns correct distance for insert', () => {
    expect(levenshteinDistance('abc', 'abcd')).toBe(1);
  });

  it('returns correct distance for delete', () => {
    expect(levenshteinDistance('abcd', 'abc')).toBe(1);
  });

  it('handles empty strings', () => {
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', '')).toBe(0);
  });
});

describe('nameSimilarity', () => {
  it('returns 1 for identical names', () => {
    expect(nameSimilarity('Jane Smith', 'Jane Smith')).toBe(1.0);
  });

  it('returns 1 for same name with different case', () => {
    expect(nameSimilarity('jane smith', 'JANE SMITH')).toBe(1.0);
  });

  it('returns high similarity for close names', () => {
    const sim = nameSimilarity('Jane Smith', 'Jane Smyth');
    expect(sim).toBeGreaterThan(0.8);
  });

  it('returns low similarity for different names', () => {
    const sim = nameSimilarity('Jane Smith', 'Robert Johnson');
    expect(sim).toBeLessThan(0.5);
  });
});

describe('tokenOverlap', () => {
  it('returns 1 for identical token sets', () => {
    expect(tokenOverlap('Jane Smith', 'Jane Smith')).toBe(1.0);
  });

  it('returns correct Jaccard for partial overlap', () => {
    // tokens: {jane, smith} vs {jane, doe}
    // intersection=1, union=3 => 1/3
    expect(tokenOverlap('Jane Smith', 'Jane Doe')).toBeCloseTo(1 / 3);
  });

  it('returns 0 for no overlap', () => {
    expect(tokenOverlap('Jane Smith', 'Robert Johnson')).toBe(0);
  });
});

describe('hasMatchingSourceId', () => {
  it('returns true when matching source ID exists', () => {
    const a = [{ source: 'fec', external_id: 'H8CA52116' }];
    const b = [
      { source: 'congress_gov', external_id: 'S123' },
      { source: 'fec', external_id: 'H8CA52116' },
    ];
    expect(hasMatchingSourceId(a, b)).toBe(true);
  });

  it('returns false when no match', () => {
    const a = [{ source: 'fec', external_id: 'H8CA52116' }];
    const b = [{ source: 'fec', external_id: 'H8CA99999' }];
    expect(hasMatchingSourceId(a, b)).toBe(false);
  });

  it('returns false for empty arrays', () => {
    expect(hasMatchingSourceId([], [])).toBe(false);
  });
});

describe('scoreMatch', () => {
  const candidate = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    canonical_name: 'Jane Smith',
    name_variants: ['SMITH, JANE A.'],
    source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
  };

  it('gives high score for exact source ID match + name match', () => {
    const incoming = {
      canonical_name: 'Jane Smith',
      name_variants: ['SMITH, JANE'],
      source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
    };
    const result = scoreMatch(incoming, candidate);
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.signals.source_id_match).toBe(true);
  });

  it('gives moderate score for name match only', () => {
    const incoming = {
      canonical_name: 'Jane Smith',
      name_variants: [],
      source_ids: [{ source: 'fec', external_id: 'DIFFERENT' }],
    };
    const result = scoreMatch(incoming, candidate);
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.score).toBeLessThan(0.6);
    expect(result.signals.source_id_match).toBe(false);
  });

  it('gives low score for different name and no source match', () => {
    const incoming = {
      canonical_name: 'Robert Johnson',
      name_variants: [],
      source_ids: [],
    };
    const result = scoreMatch(incoming, candidate);
    expect(result.score).toBeLessThan(0.3);
  });
});

describe('findMatches', () => {
  const candidates = [
    {
      id: 'id-1',
      canonical_name: 'Jane Smith',
      name_variants: ['SMITH, JANE A.'],
      source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
    },
    {
      id: 'id-2',
      canonical_name: 'John Smith',
      name_variants: ['SMITH, JOHN R.'],
      source_ids: [{ source: 'fec', external_id: 'S1234' }],
    },
    {
      id: 'id-3',
      canonical_name: 'Robert Johnson',
      name_variants: [],
      source_ids: [],
    },
  ];

  it('returns best match first', () => {
    const incoming = {
      canonical_name: 'Jane Smith',
      name_variants: ['SMITH, JANE'],
      source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
    };
    const matches = findMatches(incoming, candidates);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].candidate_id).toBe('id-1');
  });

  it('filters out low-score matches', () => {
    const incoming = {
      canonical_name: 'Completely Different Person',
      name_variants: [],
      source_ids: [],
    };
    const matches = findMatches(incoming, candidates, 0.6);
    expect(matches.length).toBe(0);
  });
});
