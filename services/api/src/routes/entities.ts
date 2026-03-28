/**
 * Entity API routes:
 *   GET /entities/:id          — Entity detail (T025)
 *   GET /entities/:id/dashboard — Dashboard aggregation (T027)
 *   GET /entities/:id/donations — Donations list (T028)
 *   GET /entities/:id/lobbying  — Lobbying list (T029)
 *   GET /entities/:id/votes     — Votes list (T030)
 *
 * All queries use parameterized SQL to prevent injection.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { DonationFilterSchema, PaginationQuerySchema, SearchQuerySchema } from '@cig/schema';
import { buildMeta, sendResponse } from '../middleware/response.js';

export interface EntityDeps {
  pool: pg.Pool;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// GET /entities/:id — Entity detail
// ============================================================

export function registerEntityRoutes(server: FastifyInstance, deps: EntityDeps): void {
  server.get('/api/v1/entities/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    if (!UUID_PATTERN.test(id)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid entity ID format',
          request_id: request.id as string,
        },
      });
    }

    // Try person table first
    const personResult = await deps.pool.query(
      `SELECT id, source_ids, canonical_name, name_variants, entity_type, party,
              jurisdictions, roles, committee_memberships, employer, occupation,
              merge_history, created_at, updated_at
       FROM person WHERE id = $1`,
      [id],
    );

    if (personResult.rows.length > 0) {
      const row = personResult.rows[0];
      const meta = buildMeta(request, { total_count: 1, page: 1, page_size: 1 });
      return sendResponse(reply, {
        id: row.id,
        entity_type: row.entity_type ?? 'person',
        canonical_name: row.canonical_name,
        source_ids: row.source_ids,
        name_variants: row.name_variants,
        party: row.party,
        jurisdictions: row.jurisdictions,
        roles: row.roles,
        committee_memberships: row.committee_memberships,
        employer: row.employer,
        occupation: row.occupation,
        merge_history: row.merge_history,
      }, meta);
    }

    // Try committee table
    const cmteResult = await deps.pool.query(
      `SELECT id, source_ids, name, name_variants, committee_type, designation,
              jurisdiction, treasurer, associated_candidate_id, filing_frequency,
              active_from, active_to, created_at, updated_at
       FROM committee WHERE id = $1`,
      [id],
    );

    if (cmteResult.rows.length > 0) {
      const row = cmteResult.rows[0];
      const meta = buildMeta(request, { total_count: 1, page: 1, page_size: 1 });
      return sendResponse(reply, {
        id: row.id,
        entity_type: 'committee',
        canonical_name: row.name,
        source_ids: row.source_ids,
        name_variants: row.name_variants,
        committee_type: row.committee_type,
        designation: row.designation,
        jurisdiction: row.jurisdiction,
        treasurer: row.treasurer,
        associated_candidate_id: row.associated_candidate_id,
        filing_frequency: row.filing_frequency,
        active_from: row.active_from,
        active_to: row.active_to,
      }, meta);
    }

    // Try organization table
    const orgResult = await deps.pool.query(
      `SELECT id, source_ids, name, name_variants, org_type, sector_id,
              industry, parent_org_id, jurisdiction, created_at, updated_at
       FROM organization WHERE id = $1`,
      [id],
    );

    if (orgResult.rows.length > 0) {
      const row = orgResult.rows[0];
      const meta = buildMeta(request, { total_count: 1, page: 1, page_size: 1 });
      return sendResponse(reply, {
        id: row.id,
        entity_type: 'organization',
        canonical_name: row.name,
        source_ids: row.source_ids,
        name_variants: row.name_variants,
        org_type: row.org_type,
        sector_id: row.sector_id,
        industry: row.industry,
        parent_org_id: row.parent_org_id,
        jurisdiction: row.jurisdiction,
      }, meta);
    }

    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Entity not found',
        request_id: request.id as string,
      },
    });
  });

  // ============================================================
  // GET /entities/:id/dashboard — Dashboard aggregation (T027)
  // ============================================================

  const DashboardQuerySchema = z.object({
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  });

  server.get('/api/v1/entities/:id/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!UUID_PATTERN.test(id)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid entity ID format', request_id: request.id as string },
      });
    }

    const parsed = DashboardQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; '), request_id: request.id as string },
      });
    }

    const { start_date, end_date } = parsed.data;

    // Funding summary — total received
    const dateConditions: string[] = [];
    const dateParams: unknown[] = [id];
    let paramIdx = 2;

    if (start_date) {
      dateConditions.push(`d.transaction_date >= $${paramIdx}`);
      dateParams.push(start_date);
      paramIdx++;
    }
    if (end_date) {
      dateConditions.push(`d.transaction_date <= $${paramIdx}`);
      dateParams.push(end_date);
      paramIdx++;
    }

    const dateWhere = dateConditions.length > 0 ? ` AND ${dateConditions.join(' AND ')}` : '';

    const fundingReceived = await deps.pool.query(
      `SELECT COALESCE(SUM(d.amount), 0) as total
       FROM donation d
       WHERE d.destination_entity_id = $1${dateWhere}`,
      dateParams,
    );

    const fundingGiven = await deps.pool.query(
      `SELECT COALESCE(SUM(d.amount), 0) as total
       FROM donation d
       WHERE d.source_entity_id = $1${dateWhere}`,
      dateParams,
    );

    // Top counterparties (inbound)
    const topCounterparties = await deps.pool.query(
      `SELECT d.source_entity_id as entity_id, d.source_entity_type as entity_type,
              SUM(d.amount) as amount, COUNT(*) as count
       FROM donation d
       WHERE d.destination_entity_id = $1${dateWhere}
       GROUP BY d.source_entity_id, d.source_entity_type
       ORDER BY amount DESC
       LIMIT 10`,
      dateParams,
    );

    // Voting summary
    const voteSummary = await deps.pool.query(
      `SELECT COUNT(*) as total_votes,
              COUNT(*) FILTER (WHERE vote_cast = 'yea') as yea_votes,
              COUNT(*) FILTER (WHERE vote_cast = 'nay') as nay_votes
       FROM vote WHERE person_id = $1`,
      [id],
    );

    const recentVotes = await deps.pool.query(
      `SELECT v.bill_id, b.bill_number, v.vote_cast, v.vote_date
       FROM vote v LEFT JOIN bill b ON b.id = v.bill_id
       WHERE v.person_id = $1
       ORDER BY v.vote_date DESC
       LIMIT 10`,
      [id],
    );

    const meta = buildMeta(request, { total_count: 1, page: 1, page_size: 1 });
    return sendResponse(reply, {
      entity: { id },
      funding_summary: {
        total_received: parseFloat(fundingReceived.rows[0]?.total ?? '0'),
        total_given: parseFloat(fundingGiven.rows[0]?.total ?? '0'),
        top_counterparties: topCounterparties.rows.map((r) => ({
          entity_id: r.entity_id,
          entity_type: r.entity_type,
          amount: parseFloat(r.amount),
          count: parseInt(r.count, 10),
        })),
      },
      voting_summary: {
        total_votes: parseInt(voteSummary.rows[0]?.total_votes ?? '0', 10),
        yea_votes: parseInt(voteSummary.rows[0]?.yea_votes ?? '0', 10),
        nay_votes: parseInt(voteSummary.rows[0]?.nay_votes ?? '0', 10),
        recent_votes: recentVotes.rows,
      },
    }, meta);
  });

  // ============================================================
  // GET /entities/:id/donations — Donations list (T028)
  // ============================================================

  server.get('/api/v1/entities/:id/donations', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!UUID_PATTERN.test(id)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid entity ID format', request_id: request.id as string },
      });
    }

    const parsed = DonationFilterSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; '), request_id: request.id as string },
      });
    }

    const { page, page_size, direction, start_date, end_date, min_amount, max_amount, sector } = parsed.data;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    // Direction filter
    if (direction === 'received') {
      conditions.push(`d.destination_entity_id = $${paramIdx}`);
      params.push(id);
      paramIdx++;
    } else if (direction === 'given') {
      conditions.push(`d.source_entity_id = $${paramIdx}`);
      params.push(id);
      paramIdx++;
    } else {
      conditions.push(`(d.source_entity_id = $${paramIdx} OR d.destination_entity_id = $${paramIdx})`);
      params.push(id);
      paramIdx++;
    }

    if (start_date) {
      conditions.push(`d.transaction_date >= $${paramIdx}`);
      params.push(start_date);
      paramIdx++;
    }
    if (end_date) {
      conditions.push(`d.transaction_date <= $${paramIdx}`);
      params.push(end_date);
      paramIdx++;
    }
    if (min_amount !== undefined) {
      conditions.push(`d.amount >= $${paramIdx}`);
      params.push(min_amount);
      paramIdx++;
    }
    if (max_amount !== undefined) {
      conditions.push(`d.amount <= $${paramIdx}`);
      params.push(max_amount);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countResult = await deps.pool.query(
      `SELECT COUNT(*) as total FROM donation d ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Fetch page
    const offset = (page - 1) * page_size;
    const donationResult = await deps.pool.query(
      `SELECT d.id, d.source_entity_id, d.source_entity_type,
              d.destination_entity_id, d.destination_entity_type,
              d.amount, d.transaction_date, d.transaction_type,
              d.election_cycle, d.filing_id, d.source_system, d.source_record_id
       FROM donation d ${whereClause}
       ORDER BY d.transaction_date DESC NULLS LAST
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, page_size, offset],
    );

    const meta = buildMeta(request, { total_count: total, page, page_size });
    return sendResponse(reply, { donations: donationResult.rows }, meta);
  });

  // ============================================================
  // GET /entities/:id/lobbying — Lobbying list (T029)
  // ============================================================

  server.get('/api/v1/entities/:id/lobbying', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!UUID_PATTERN.test(id)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid entity ID format', request_id: request.id as string },
      });
    }

    const parsed = PaginationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; '), request_id: request.id as string },
      });
    }

    const { page, page_size } = parsed.data;

    const countResult = await deps.pool.query(
      `SELECT COUNT(*) as total FROM lobbying_engagement
       WHERE registrant_id = $1 OR client_id = $1`,
      [id],
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const offset = (page - 1) * page_size;
    const lobbyingResult = await deps.pool.query(
      `SELECT id, registrant_id, client_id, filing_type, filing_date,
              amount, issues, lobbyists, government_entities,
              source_system, source_record_id
       FROM lobbying_engagement
       WHERE registrant_id = $1 OR client_id = $1
       ORDER BY filing_date DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [id, page_size, offset],
    );

    const meta = buildMeta(request, { total_count: total, page, page_size });
    return sendResponse(reply, { lobbying_engagements: lobbyingResult.rows }, meta);
  });

  // ============================================================
  // GET /entities/:id/votes — Votes list (T030)
  // ============================================================

  server.get('/api/v1/entities/:id/votes', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!UUID_PATTERN.test(id)) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid entity ID format', request_id: request.id as string },
      });
    }

    const parsed = PaginationQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: { code: 'VALIDATION_ERROR', message: parsed.error.issues.map((i) => i.message).join('; '), request_id: request.id as string },
      });
    }

    const { page, page_size } = parsed.data;

    const countResult = await deps.pool.query(
      `SELECT COUNT(*) as total FROM vote WHERE person_id = $1`,
      [id],
    );
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    const offset = (page - 1) * page_size;
    const votesResult = await deps.pool.query(
      `SELECT v.id, v.person_id, v.bill_id, b.bill_number, b.title as bill_title,
              v.vote_cast, v.vote_date, v.session, v.roll_call_number,
              v.source_system, v.source_record_id
       FROM vote v LEFT JOIN bill b ON b.id = v.bill_id
       WHERE v.person_id = $1
       ORDER BY v.vote_date DESC NULLS LAST
       LIMIT $2 OFFSET $3`,
      [id, page_size, offset],
    );

    const meta = buildMeta(request, { total_count: total, page, page_size });
    return sendResponse(reply, { votes: votesResult.rows }, meta);
  });
}
