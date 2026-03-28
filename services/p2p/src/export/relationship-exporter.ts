/**
 * PostgreSQL → Hyperbee relationship exporter (T058).
 * Reads donations, lobbying, votes, and affiliations from PostgreSQL
 * and writes them to the cig-relationships Hyperbee with proper key schemas.
 */

import type pg from 'pg';
import type Hyperbee from 'hyperbee';
import { relationshipKeys } from '@cig/p2p-protocol';

export interface RelationshipExportStats {
  donations: number;
  lobbying: number;
  votes: number;
  affiliations: number;
  totalExported: number;
}

/**
 * Export all relationships from PostgreSQL to a Hyperbee.
 */
export async function exportRelationships(
  pool: pg.Pool,
  bee: Hyperbee,
  onProgress?: (stats: RelationshipExportStats) => void,
): Promise<RelationshipExportStats> {
  const stats: RelationshipExportStats = {
    donations: 0,
    lobbying: 0,
    votes: 0,
    affiliations: 0,
    totalExported: 0,
  };

  await exportDonations(pool, bee, stats);
  onProgress?.(stats);
  await exportLobbying(pool, bee, stats);
  onProgress?.(stats);
  await exportVotes(pool, bee, stats);
  onProgress?.(stats);
  await exportAffiliations(pool, bee, stats);
  onProgress?.(stats);

  return stats;
}

async function exportDonations(pool: pg.Pool, bee: Hyperbee, stats: RelationshipExportStats): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    source_entity_id: string;
    destination_entity_id: string;
    amount: number;
    transaction_date: string;
    transaction_type: string;
    fec_transaction_type: string | null;
    election_cycle: string | null;
    filing_id: string | null;
    source_system: string;
    source_record_id: string | null;
    is_memo: boolean;
    amendment_chain: unknown[];
    amendment_status: string;
    created_at: string;
  }>(`SELECT id, source_entity_id, destination_entity_id, amount,
      transaction_date, transaction_type, fec_transaction_type,
      election_cycle, filing_id, source_system, source_record_id,
      is_memo, amendment_chain, amendment_status, created_at
      FROM donation`);

  for (const row of rows) {
    const date = row.transaction_date ?? '';
    const record = { ...row };

    // Primary: donation/{recipient_id}/{date}/{id}
    const key = relationshipKeys.donation(row.destination_entity_id, date, row.id);
    await bee.put(key, record);

    // Reverse: donation-source/{donor_id}/{date}/{id}
    const reverseKey = relationshipKeys.donationSource(row.source_entity_id, date, row.id);
    await bee.put(reverseKey, {
      donation_id: row.id,
      recipient_id: row.destination_entity_id,
      amount: row.amount,
    });

    stats.donations++;
    stats.totalExported++;
  }
}

async function exportLobbying(pool: pg.Pool, bee: Hyperbee, stats: RelationshipExportStats): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    client_entity_id: string;
    target_entity_id: string;
    issue_code: string | null;
    issue_description: string | null;
    filing_date: string;
    amount: number | null;
    filing_id: string | null;
    source_system: string;
    created_at: string;
  }>(`SELECT id, client_entity_id, target_entity_id, issue_code,
      issue_description, filing_date, amount, filing_id,
      source_system, created_at
      FROM lobbying_engagement`);

  for (const row of rows) {
    const date = row.filing_date ?? '';
    const key = relationshipKeys.lobbying(row.target_entity_id, date, row.id);
    await bee.put(key, { ...row });
    stats.lobbying++;
    stats.totalExported++;
  }
}

async function exportVotes(pool: pg.Pool, bee: Hyperbee, stats: RelationshipExportStats): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    voter_entity_id: string;
    bill_entity_id: string;
    vote_cast: string;
    vote_date: string;
    roll_call_number: string | null;
    session: string | null;
    source_system: string;
    created_at: string;
  }>(`SELECT id, voter_entity_id, bill_entity_id, vote_cast,
      vote_date, roll_call_number, session, source_system, created_at
      FROM vote`);

  for (const row of rows) {
    const date = row.vote_date ?? '';
    const key = relationshipKeys.vote(row.voter_entity_id, date, row.bill_entity_id);
    await bee.put(key, { ...row });
    stats.votes++;
    stats.totalExported++;
  }
}

async function exportAffiliations(pool: pg.Pool, bee: Hyperbee, stats: RelationshipExportStats): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    entity_id: string;
    organization_id: string;
    role: string | null;
    start_date: string | null;
    end_date: string | null;
    source_system: string;
    created_at: string;
  }>(`SELECT id, entity_id, organization_id, role,
      start_date, end_date, source_system, created_at
      FROM affiliation`);

  for (const row of rows) {
    const key = relationshipKeys.affiliation(row.entity_id, row.organization_id);
    await bee.put(key, { ...row });
    stats.affiliations++;
    stats.totalExported++;
  }
}
