// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  diceSimilarity,
  matchEntity,
  extractCandidateNames,
  scanPageForEntities,
  type CachedEntity,
} from '../content/detector.js';

// ============================================================
// normalizeName
// ============================================================

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName('  Nancy Pelosi  ')).toBe('nancy pelosi');
  });

  it('collapses whitespace', () => {
    expect(normalizeName('John   Q    Public')).toBe('john q public');
  });

  it('strips punctuation except hyphens', () => {
    expect(normalizeName("O'Brien-Smith")).toBe('obrien-smith');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeName('')).toBe('');
  });
});

// ============================================================
// diceSimilarity
// ============================================================

describe('diceSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(diceSimilarity('nancy pelosi', 'nancy pelosi')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(diceSimilarity('ab', 'xy')).toBe(0);
  });

  it('returns 0 for single-char strings', () => {
    expect(diceSimilarity('a', 'b')).toBe(0);
  });

  it('returns high score for similar strings', () => {
    const score = diceSimilarity('nancy pelosi', 'nancy peloso');
    expect(score).toBeGreaterThan(0.8);
  });

  it('returns low score for dissimilar strings', () => {
    const score = diceSimilarity('nancy pelosi', 'john smith');
    expect(score).toBeLessThan(0.5);
  });
});

// ============================================================
// matchEntity
// ============================================================

describe('matchEntity', () => {
  const cache: CachedEntity[] = [
    { id: '1', name: 'Nancy Pelosi', entityType: 'person', variants: ['PELOSI, NANCY'] },
    { id: '2', name: 'Mitch McConnell', entityType: 'person', variants: [] },
  ];

  it('matches exact canonical name', () => {
    const result = matchEntity('Nancy Pelosi', cache);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('1');
    expect(result!.score).toBe(1);
  });

  it('returns null for short text', () => {
    expect(matchEntity('ab', cache)).toBeNull();
  });

  it('returns null for no match', () => {
    expect(matchEntity('Some Random Person', cache)).toBeNull();
  });

  it('matches best entity when multiple are close', () => {
    const result = matchEntity('Mitch McConnell', cache);
    expect(result).not.toBeNull();
    expect(result!.id).toBe('2');
  });
});

// ============================================================
// extractCandidateNames
// ============================================================

describe('extractCandidateNames', () => {
  it('extracts a 2-word capitalized name', () => {
    expect(extractCandidateNames('I met Nancy Pelosi yesterday.')).toEqual(['Nancy Pelosi']);
  });

  it('extracts a 3-word capitalized name', () => {
    expect(extractCandidateNames('Talk to John Quincy Adams.')).toEqual(['John Quincy Adams']);
  });

  it('extracts multiple names', () => {
    const names = extractCandidateNames('Nancy Pelosi and Chuck Schumer met.');
    expect(names).toContain('Nancy Pelosi');
    expect(names).toContain('Chuck Schumer');
  });

  it('ignores lowercase words', () => {
    expect(extractCandidateNames('some random text here')).toEqual([]);
  });

  it('ignores single capitalized words', () => {
    expect(extractCandidateNames('The president spoke today.')).toEqual([]);
  });
});

// ============================================================
// scanPageForEntities
// ============================================================

describe('scanPageForEntities', () => {
  const cache: CachedEntity[] = [
    { id: '1', name: 'Nancy Pelosi', entityType: 'person', variants: [] },
  ];

  it('finds entities in text nodes', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>I met Nancy Pelosi at the event.</p>';

    const results = scanPageForEntities(div, cache);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].match.id).toBe('1');
  });

  it('skips script tags', () => {
    const div = document.createElement('div');
    div.innerHTML = '<script>var x = "Nancy Pelosi";</script>';

    const results = scanPageForEntities(div, cache);
    expect(results).toHaveLength(0);
  });

  it('skips style tags', () => {
    const div = document.createElement('div');
    div.innerHTML = '<style>.Nancy Pelosi { color: red; }</style>';

    const results = scanPageForEntities(div, cache);
    expect(results).toHaveLength(0);
  });

  it('returns empty for empty cache', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>Nancy Pelosi spoke today.</p>';

    const results = scanPageForEntities(div, []);
    expect(results).toHaveLength(0);
  });
});
