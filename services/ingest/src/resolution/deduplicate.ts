/**
 * Entity deduplication pipeline.
 *
 * Normalizes incoming parsed records, uses packages/entity-resolution for
 * fuzzy matching and scoring, and produces merge/insert decisions with an
 * audit trail.
 *
 * Flow:
 * 1. Extract entity fields from a parsed FEC record
 * 2. Normalize name and build match payload
 * 3. Search existing candidates (via supplied lookup function)
 * 4. Score candidates against incoming record
 * 5. Return a resolution decision: insert_new or merge_into
 */

import {
  normalizeName,
  normalizeNameOrder,
  findMatches,
  scoreMatch,
  type MatchCandidate,
  type MatchResult,
  type MatchWeights,
} from '@cig/entity-resolution';
import type { FecRecord } from '../pipelines/fec-parse.js';

// ============================================================
// TYPES
// ============================================================

export interface EntityCandidate {
  id: string;
  canonical_name: string;
  name_variants: string[];
  source_ids: Array<{ source: string; external_id: string }>;
}

export type ResolutionAction = 'insert_new' | 'merge_into';

export interface ResolutionDecision {
  action: ResolutionAction;
  /** Set when action is 'merge_into' — the existing entity to merge into. */
  target_id: string | null;
  /** The match score when merging. */
  score: number;
  /** Incoming entity identifier (e.g. FEC ID) for audit. */
  incoming_id: string;
  /** Normalized canonical name of the incoming record. */
  canonical_name: string;
  /** All name variants collected from the incoming record. */
  name_variants: string[];
  /** Source identifiers from the incoming record. */
  source_ids: Array<{ source: string; external_id: string }>;
  /** Full match result details when merging. */
  match_details: MatchResult | null;
}

export interface DeduplicationStats {
  processed: number;
  inserted: number;
  merged: number;
  skipped: number;
}

// ============================================================
// CANDIDATE LOOKUP (injectable dependency)
// ============================================================

/**
 * A function that searches for existing entity candidates matching a name.
 * Implementors may query PostgreSQL, OpenSearch, or an in-memory index.
 */
export type CandidateLookup = (
  canonicalName: string,
  sourceIds: Array<{ source: string; external_id: string }>
) => Promise<EntityCandidate[]>;

// ============================================================
// FEC RECORD → ENTITY EXTRACTION
// ============================================================

/** Extract a candidate entity from an FEC cn (candidate master) record. */
export function extractCandidateEntity(record: FecRecord): {
  canonical_name: string;
  name_variants: string[];
  source_ids: Array<{ source: string; external_id: string }>;
  external_id: string;
} {
  const rawName = record.CAND_NAME || '';
  const canonical = normalizeNameOrder(rawName);
  const normalized = normalizeName(rawName);

  const nameVariants = new Set<string>();
  nameVariants.add(rawName);
  if (canonical !== rawName.toLowerCase()) nameVariants.add(canonical);
  if (normalized !== canonical) nameVariants.add(normalized);

  const externalId = record.CAND_ID || '';
  const sourceIds = externalId
    ? [{ source: 'fec', external_id: externalId }]
    : [];

  return {
    canonical_name: canonical,
    name_variants: [...nameVariants],
    source_ids: sourceIds,
    external_id: externalId,
  };
}

/** Extract a committee entity from an FEC cm (committee master) record. */
export function extractCommitteeEntity(record: FecRecord): {
  canonical_name: string;
  name_variants: string[];
  source_ids: Array<{ source: string; external_id: string }>;
  external_id: string;
} {
  const rawName = record.CMTE_NM || '';
  const canonical = normalizeName(rawName);

  const nameVariants = new Set<string>();
  nameVariants.add(rawName);
  if (canonical !== rawName.toLowerCase()) nameVariants.add(canonical);

  const externalId = record.CMTE_ID || '';
  const sourceIds = externalId
    ? [{ source: 'fec', external_id: externalId }]
    : [];

  return {
    canonical_name: canonical,
    name_variants: [...nameVariants],
    source_ids: sourceIds,
    external_id: externalId,
  };
}

/** Extract a person entity from an individual contribution record. */
export function extractIndividualEntity(record: FecRecord): {
  canonical_name: string;
  name_variants: string[];
  source_ids: Array<{ source: string; external_id: string }>;
  external_id: string;
  employer: string;
  occupation: string;
} {
  const rawName = record.NAME || '';
  const canonical = normalizeNameOrder(rawName);
  const normalized = normalizeName(rawName);

  const nameVariants = new Set<string>();
  nameVariants.add(rawName);
  if (canonical !== rawName.toLowerCase()) nameVariants.add(canonical);
  if (normalized !== canonical) nameVariants.add(normalized);

  // Individual contributors don't have a stable FEC ID — we use SUB_ID as a record ref
  const subId = record.SUB_ID || '';
  const sourceIds = subId
    ? [{ source: 'fec_indiv', external_id: subId }]
    : [];

  return {
    canonical_name: canonical,
    name_variants: [...nameVariants],
    source_ids: sourceIds,
    external_id: subId,
    employer: record.EMPLOYER || '',
    occupation: record.OCCUPATION || '',
  };
}

// ============================================================
// RESOLUTION ENGINE
// ============================================================

const DEFAULT_MERGE_THRESHOLD = 0.7;

/**
 * Resolve an incoming entity against existing candidates.
 * Returns a decision: insert a new entity or merge into an existing one.
 */
export async function resolveEntity(
  incoming: {
    canonical_name: string;
    name_variants: string[];
    source_ids: Array<{ source: string; external_id: string }>;
    external_id: string;
  },
  lookupCandidates: CandidateLookup,
  mergeThreshold: number = DEFAULT_MERGE_THRESHOLD,
  weights?: MatchWeights,
): Promise<ResolutionDecision> {
  // Skip if no name to match
  if (!incoming.canonical_name.trim()) {
    return {
      action: 'insert_new',
      target_id: null,
      score: 0,
      incoming_id: incoming.external_id,
      canonical_name: incoming.canonical_name,
      name_variants: incoming.name_variants,
      source_ids: incoming.source_ids,
      match_details: null,
    };
  }

  const candidates = await lookupCandidates(incoming.canonical_name, incoming.source_ids);

  if (candidates.length === 0) {
    return {
      action: 'insert_new',
      target_id: null,
      score: 0,
      incoming_id: incoming.external_id,
      canonical_name: incoming.canonical_name,
      name_variants: incoming.name_variants,
      source_ids: incoming.source_ids,
      match_details: null,
    };
  }

  const matchCandidates: MatchCandidate[] = candidates.map((c) => ({
    id: c.id,
    canonical_name: c.canonical_name,
    name_variants: c.name_variants,
    source_ids: c.source_ids,
  }));

  const matches = findMatches(
    {
      canonical_name: incoming.canonical_name,
      name_variants: incoming.name_variants,
      source_ids: incoming.source_ids,
    },
    matchCandidates,
    mergeThreshold,
    weights,
  );

  if (matches.length === 0) {
    return {
      action: 'insert_new',
      target_id: null,
      score: 0,
      incoming_id: incoming.external_id,
      canonical_name: incoming.canonical_name,
      name_variants: incoming.name_variants,
      source_ids: incoming.source_ids,
      match_details: null,
    };
  }

  const bestMatch = matches[0];
  return {
    action: 'merge_into',
    target_id: bestMatch.candidate_id,
    score: bestMatch.score,
    incoming_id: incoming.external_id,
    canonical_name: incoming.canonical_name,
    name_variants: incoming.name_variants,
    source_ids: incoming.source_ids,
    match_details: bestMatch,
  };
}

/**
 * Process a batch of FEC records through the deduplication pipeline.
 * Calls onDecision for each resolution decision.
 */
export async function deduplicateBatch(
  records: FecRecord[],
  entityType: 'candidate' | 'committee' | 'individual',
  lookupCandidates: CandidateLookup,
  onDecision: (decision: ResolutionDecision, record: FecRecord) => Promise<void>,
  mergeThreshold?: number,
): Promise<DeduplicationStats> {
  const stats: DeduplicationStats = { processed: 0, inserted: 0, merged: 0, skipped: 0 };

  const extractFn =
    entityType === 'candidate'
      ? extractCandidateEntity
      : entityType === 'committee'
        ? extractCommitteeEntity
        : extractIndividualEntity;

  for (const record of records) {
    stats.processed++;

    const entity = extractFn(record);
    if (!entity.canonical_name.trim()) {
      stats.skipped++;
      continue;
    }

    const decision = await resolveEntity(entity, lookupCandidates, mergeThreshold);

    if (decision.action === 'insert_new') {
      stats.inserted++;
    } else {
      stats.merged++;
    }

    await onDecision(decision, record);
  }

  return stats;
}
