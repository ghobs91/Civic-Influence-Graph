/**
 * Entity resolution utilities: fuzzy name matching, source-ID cross-reference, and scoring.
 *
 * Implements a multi-signal matching approach:
 * 1. Exact source-ID match (highest confidence)
 * 2. Normalized name exact match
 * 3. Fuzzy name similarity (Levenshtein + token overlap)
 * 4. Composite scoring with configurable weights
 */

// ============================================================
// NAME NORMALIZATION
// ============================================================

const SUFFIXES = /\b(jr|sr|ii|iii|iv|v|esq|phd|md|dds|dvm)\b\.?/gi;
const PREFIXES = /^(mr|mrs|ms|dr|hon|sen|rep)\b\.?\s*/gi;
const MULTI_SPACE = /\s+/g;
const NON_ALPHA_SPACE = /[^a-z\s]/g;

/**
 * Normalize a name for comparison: lowercase, strip titles/suffixes,
 * remove punctuation, collapse whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(PREFIXES, '')
    .replace(SUFFIXES, '')
    .replace(NON_ALPHA_SPACE, '')
    .replace(MULTI_SPACE, ' ')
    .trim();
}

/**
 * Convert "LAST, FIRST MIDDLE" format to "FIRST MIDDLE LAST".
 */
export function normalizeNameOrder(name: string): string {
  const parts = name.split(',').map((s) => s.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return normalizeName(`${parts[1]} ${parts[0]}`);
  }
  return normalizeName(name);
}

// ============================================================
// FUZZY MATCHING
// ============================================================

/**
 * Compute the Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Use single-row DP for space efficiency
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }

  return prev[n];
}

/**
 * Compute name similarity as a 0–1 score using normalized Levenshtein distance.
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1.0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(na, nb);
  return 1 - dist / maxLen;
}

/**
 * Compute token-level overlap (Jaccard similarity) between two names.
 */
export function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(normalizeName(a).split(' '));
  const tokensB = new Set(normalizeName(b).split(' '));
  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 1.0 : intersection / union;
}

// ============================================================
// SOURCE-ID CROSS-REFERENCE
// ============================================================

export interface SourceIdPair {
  source: string;
  external_id: string;
}

/**
 * Check if two entities share any source-system ID.
 * An exact match on (source, external_id) is the strongest signal.
 */
export function hasMatchingSourceId(
  sourceIdsA: SourceIdPair[],
  sourceIdsB: SourceIdPair[]
): boolean {
  for (const a of sourceIdsA) {
    for (const b of sourceIdsB) {
      if (a.source === b.source && a.external_id === b.external_id) {
        return true;
      }
    }
  }
  return false;
}

// ============================================================
// COMPOSITE SCORING
// ============================================================

export interface MatchCandidate {
  id: string;
  canonical_name: string;
  name_variants: string[];
  source_ids: SourceIdPair[];
}

export interface MatchResult {
  candidate_id: string;
  score: number;
  signals: {
    source_id_match: boolean;
    name_similarity: number;
    token_overlap: number;
    variant_max_similarity: number;
  };
}

export interface MatchWeights {
  source_id: number;
  name_similarity: number;
  token_overlap: number;
  variant_similarity: number;
}

const DEFAULT_WEIGHTS: MatchWeights = {
  source_id: 0.5,
  name_similarity: 0.25,
  token_overlap: 0.15,
  variant_similarity: 0.1,
};

/**
 * Score a match between an incoming record and a candidate entity.
 * Returns a composite score between 0 and 1.
 */
export function scoreMatch(
  incoming: { canonical_name: string; name_variants: string[]; source_ids: SourceIdPair[] },
  candidate: MatchCandidate,
  weights: MatchWeights = DEFAULT_WEIGHTS
): MatchResult {
  const sourceIdMatch = hasMatchingSourceId(incoming.source_ids, candidate.source_ids);

  const nameNorm = nameSimilarity(incoming.canonical_name, candidate.canonical_name);
  const tokenOvlp = tokenOverlap(incoming.canonical_name, candidate.canonical_name);

  // Best similarity across all variant combinations
  let variantMax = 0;
  for (const va of incoming.name_variants) {
    for (const vb of candidate.name_variants) {
      const sim = nameSimilarity(va, vb);
      if (sim > variantMax) variantMax = sim;
    }
  }
  // Also compare incoming canonical against candidate variants
  for (const vb of candidate.name_variants) {
    const sim = nameSimilarity(incoming.canonical_name, vb);
    if (sim > variantMax) variantMax = sim;
  }

  const score =
    (sourceIdMatch ? weights.source_id : 0) +
    nameNorm * weights.name_similarity +
    tokenOvlp * weights.token_overlap +
    variantMax * weights.variant_similarity;

  return {
    candidate_id: candidate.id,
    score: Math.min(score, 1.0),
    signals: {
      source_id_match: sourceIdMatch,
      name_similarity: nameNorm,
      token_overlap: tokenOvlp,
      variant_max_similarity: variantMax,
    },
  };
}

/**
 * Find the best matching candidate from a list.
 * Returns matches above the threshold, sorted by score descending.
 */
export function findMatches(
  incoming: { canonical_name: string; name_variants: string[]; source_ids: SourceIdPair[] },
  candidates: MatchCandidate[],
  threshold = 0.6,
  weights: MatchWeights = DEFAULT_WEIGHTS
): MatchResult[] {
  return candidates
    .map((c) => scoreMatch(incoming, c, weights))
    .filter((r) => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
