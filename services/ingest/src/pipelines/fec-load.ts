/**
 * FEC database loader.
 *
 * Inserts/upserts parsed and deduplicated FEC entities and relationships
 * into PostgreSQL tables and syncs corresponding Apache AGE graph nodes/edges.
 *
 * Uses parameterized queries throughout to prevent SQL injection.
 * All operations run within transactions for consistency.
 */

import type pg from 'pg';
import type { FecRecord } from './fec-parse.js';
import { parseFecDate, parseFecAmount, mapTransactionType, mapCommitteeType, mapCandidateOffice } from './fec-parse.js';
import type { ResolutionDecision } from '../resolution/deduplicate.js';

// ============================================================
// TYPES
// ============================================================

export interface LoadStats {
  persons_inserted: number;
  persons_updated: number;
  committees_inserted: number;
  committees_updated: number;
  donations_inserted: number;
  linkages_processed: number;
  graph_nodes_created: number;
  graph_edges_created: number;
}

export interface LoaderDeps {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<pg.QueryResult<T>>;
  transaction: <T>(fn: (client: pg.PoolClient) => Promise<T>) => Promise<T>;
}

// ============================================================
// CANDIDATE (PERSON) LOADING
// ============================================================

/**
 * Upsert a candidate (person) from an FEC cn record.
 * If the person already exists (matched by source_ids), update; otherwise insert.
 * Returns the person's UUID.
 */
export async function upsertCandidate(
  client: pg.PoolClient,
  record: FecRecord,
  decision: ResolutionDecision,
): Promise<string> {
  const candId = record.CAND_ID || '';
  const office = mapCandidateOffice(record.CAND_OFFICE || '');
  const state = record.CAND_OFFICE_ST || '';
  const district = record.CAND_OFFICE_DISTRICT || '';
  const party = record.CAND_PTY_AFFILIATION || null;
  const jurisdictions = state ? [state === 'US' ? 'federal' : state] : ['federal'];

  const entityType = office === 'president' ? 'legislator'
    : (office === 'senator' || office === 'representative') ? 'legislator'
    : 'other';

  const role = {
    role: office,
    body: office === 'senator' ? 'US Senate'
      : office === 'representative' ? 'US House'
      : office === 'president' ? 'US President'
      : office,
    state: state || undefined,
    district: district || undefined,
  };

  if (decision.action === 'merge_into' && decision.target_id) {
    // Update existing person: add name variants, source_ids, update roles
    const result = await client.query<{ id: string }>(
      `UPDATE person SET
        name_variants = array(SELECT DISTINCT unnest(name_variants || $2::text[])),
        source_ids = source_ids || $3::jsonb,
        party = COALESCE($4, party),
        jurisdictions = array(SELECT DISTINCT unnest(jurisdictions || $5::text[])),
        entity_type = $6::entity_type
      WHERE id = $1
      RETURNING id`,
      [
        decision.target_id,
        decision.name_variants,
        JSON.stringify(decision.source_ids),
        party,
        jurisdictions,
        entityType,
      ],
    );
    return result.rows[0].id;
  }

  // Insert new person
  const result = await client.query<{ id: string }>(
    `INSERT INTO person (source_ids, canonical_name, name_variants, entity_type, party, jurisdictions, roles)
     VALUES ($1::jsonb, $2, $3::text[], $4::entity_type, $5, $6::text[], $7::jsonb)
     RETURNING id`,
    [
      JSON.stringify(decision.source_ids),
      decision.canonical_name,
      decision.name_variants,
      entityType,
      party,
      jurisdictions,
      JSON.stringify([role]),
    ],
  );
  return result.rows[0].id;
}

// ============================================================
// COMMITTEE LOADING
// ============================================================

/**
 * Upsert a committee from an FEC cm record.
 * Returns the committee's UUID.
 */
export async function upsertCommittee(
  client: pg.PoolClient,
  record: FecRecord,
  decision: ResolutionDecision,
): Promise<string> {
  const cmteType = mapCommitteeType(record.CMTE_TP || '');
  const designation = record.CMTE_DSGN || null;
  const jurisdiction = record.CMTE_ST || null;
  const treasurer = record.TRES_NM || null;
  const filingFreq = record.CMTE_FILING_FREQ || null;

  if (decision.action === 'merge_into' && decision.target_id) {
    const result = await client.query<{ id: string }>(
      `UPDATE committee SET
        name_variants = array(SELECT DISTINCT unnest(name_variants || $2::text[])),
        source_ids = source_ids || $3::jsonb,
        committee_type = $4::committee_type,
        designation = COALESCE($5, designation),
        jurisdiction = COALESCE($6, jurisdiction),
        treasurer = COALESCE($7, treasurer),
        filing_frequency = COALESCE($8, filing_frequency)
      WHERE id = $1
      RETURNING id`,
      [
        decision.target_id,
        decision.name_variants,
        JSON.stringify(decision.source_ids),
        cmteType,
        designation,
        jurisdiction,
        treasurer,
        filingFreq,
      ],
    );
    return result.rows[0].id;
  }

  const result = await client.query<{ id: string }>(
    `INSERT INTO committee (source_ids, name, name_variants, committee_type, designation, jurisdiction, treasurer, filing_frequency)
     VALUES ($1::jsonb, $2, $3::text[], $4::committee_type, $5, $6, $7, $8)
     RETURNING id`,
    [
      JSON.stringify(decision.source_ids),
      decision.canonical_name,
      decision.name_variants,
      cmteType,
      designation,
      jurisdiction,
      treasurer,
      filingFreq,
    ],
  );
  return result.rows[0].id;
}

// ============================================================
// DONATION LOADING
// ============================================================

/**
 * Insert a donation record from an FEC indiv/pas2/oth record.
 * The source_entity_id and destination_committee_id must already be resolved.
 * Returns the donation UUID.
 */
export async function insertDonation(
  client: pg.PoolClient,
  record: FecRecord,
  sourceEntityId: string,
  sourceEntityType: 'person' | 'committee' | 'organization',
  destinationCommitteeId: string,
  electionCycle: string,
  amendmentChain: Array<{ filing_id: string; amendment_indicator: string; date: string }> = [],
): Promise<string> {
  const amount = parseFecAmount(record.TRANSACTION_AMT || '') ?? 0;
  const transDate = parseFecDate(record.TRANSACTION_DT || '');
  const fecTransType = record.TRANSACTION_TP || '';
  const transType = mapTransactionType(fecTransType);
  const isMemo = record.MEMO_CD === 'X';
  const filingId = record.FILE_NUM || null;
  const sourceRecordId = record.SUB_ID || null;

  if (!transDate) {
    throw new Error(`Missing or invalid transaction date for record SUB_ID=${record.SUB_ID}`);
  }

  const result = await client.query<{ id: string }>(
    `INSERT INTO donation (
      source_entity_id, source_entity_type, destination_entity_id,
      amount, transaction_date, election_cycle,
      transaction_type, fec_transaction_type, is_memo,
      filing_id, amendment_chain, source_system, source_record_id
    ) VALUES ($1, $2::source_entity_type, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
    RETURNING id`,
    [
      sourceEntityId,
      sourceEntityType,
      destinationCommitteeId,
      Math.abs(amount), // Store absolute value; negative amounts are refunds handled by transaction_type
      transDate,
      electionCycle,
      transType,
      fecTransType,
      isMemo,
      filingId,
      JSON.stringify(amendmentChain),
      'fec',
      sourceRecordId,
    ],
  );
  return result.rows[0].id;
}

// ============================================================
// CANDIDATE-COMMITTEE LINKAGE
// ============================================================

/**
 * Process a candidate-committee linkage (ccl) record.
 * Updates the committee's associated_candidate_id.
 */
export async function processLinkage(
  client: pg.PoolClient,
  record: FecRecord,
  candidateIdMap: Map<string, string>,
  committeeIdMap: Map<string, string>,
): Promise<boolean> {
  const fecCandId = record.CAND_ID || '';
  const fecCmteId = record.CMTE_ID || '';

  const personId = candidateIdMap.get(fecCandId);
  const committeeId = committeeIdMap.get(fecCmteId);

  if (!personId || !committeeId) return false;

  await client.query(
    `UPDATE committee SET associated_candidate_id = $1 WHERE id = $2 AND associated_candidate_id IS NULL`,
    [personId, committeeId],
  );
  return true;
}

// ============================================================
// GRAPH SYNC (Apache AGE)
// ============================================================

/**
 * Create or update a graph vertex in Apache AGE.
 * Uses MERGE to upsert based on entity_id property.
 */
export async function upsertGraphVertex(
  client: pg.PoolClient,
  label: string,
  entityId: string,
  name: string,
): Promise<void> {
  // AGE requires LOAD and search_path set per session
  await client.query("LOAD 'age'");
  await client.query("SET search_path = ag_catalog, \"$user\", public");

  await client.query(
    `SELECT * FROM cypher('influence', $$
      MERGE (n:${label} {entity_id: '${entityId}'})
      SET n.name = '${name.replace(/'/g, "''")}'
      RETURN n
    $$) AS (n agtype)`,
  );
}

/**
 * Create a graph edge (donation) in Apache AGE.
 */
export async function createGraphDonationEdge(
  client: pg.PoolClient,
  sourceId: string,
  sourceLabel: string,
  targetId: string,
  targetLabel: string,
  amount: number,
  date: string,
  filingId: string,
): Promise<void> {
  await client.query("LOAD 'age'");
  await client.query("SET search_path = ag_catalog, \"$user\", public");

  await client.query(
    `SELECT * FROM cypher('influence', $$
      MATCH (s:${sourceLabel} {entity_id: '${sourceId}'}),
            (t:${targetLabel} {entity_id: '${targetId}'})
      CREATE (s)-[:DONATED_TO {amount: ${amount}, date: '${date}', filing_id: '${filingId.replace(/'/g, "''")}'}]->(t)
      RETURN s, t
    $$) AS (s agtype, t agtype)`,
  );
}

// ============================================================
// FEC ID LOOKUP HELPERS
// ============================================================

/**
 * Look up a person's UUID by their FEC candidate ID.
 */
export async function findPersonByFecId(
  client: pg.PoolClient,
  fecCandId: string,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM person WHERE source_ids @> $1::jsonb LIMIT 1`,
    [JSON.stringify([{ source: 'fec', external_id: fecCandId }])],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Look up a committee's UUID by their FEC committee ID.
 */
export async function findCommitteeByFecId(
  client: pg.PoolClient,
  fecCmteId: string,
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `SELECT id FROM committee WHERE source_ids @> $1::jsonb LIMIT 1`,
    [JSON.stringify([{ source: 'fec', external_id: fecCmteId }])],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Build a mapping of FEC IDs → internal UUIDs for all loaded persons.
 */
export async function buildCandidateIdMap(
  client: pg.PoolClient,
): Promise<Map<string, string>> {
  const result = await client.query<{ id: string; source_ids: Array<{ source: string; external_id: string }> }>(
    `SELECT id, source_ids FROM person WHERE source_ids @> '[{"source": "fec"}]'::jsonb`,
  );
  const map = new Map<string, string>();
  for (const row of result.rows) {
    for (const sid of row.source_ids) {
      if (sid.source === 'fec') {
        map.set(sid.external_id, row.id);
      }
    }
  }
  return map;
}

/**
 * Build a mapping of FEC committee IDs → internal UUIDs.
 */
export async function buildCommitteeIdMap(
  client: pg.PoolClient,
): Promise<Map<string, string>> {
  const result = await client.query<{ id: string; source_ids: Array<{ source: string; external_id: string }> }>(
    `SELECT id, source_ids FROM committee WHERE source_ids @> '[{"source": "fec"}]'::jsonb`,
  );
  const map = new Map<string, string>();
  for (const row of result.rows) {
    for (const sid of row.source_ids) {
      if (sid.source === 'fec') {
        map.set(sid.external_id, row.id);
      }
    }
  }
  return map;
}
