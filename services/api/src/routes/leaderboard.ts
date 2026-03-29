/**
 * Leaderboard API route:
 *   GET /api/v1/leaderboard — Top donors/PACs/SuperPACs by donation amount
 *
 * Returns entities ranked by total donation amount within a time period.
 * Excludes FEC memo transactions (is_memo = true) to avoid double-counting.
 * All queries use parameterized SQL to prevent injection.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { buildMeta, sendResponse } from '../middleware/response.js';

export interface LeaderboardDeps {
  pool: pg.Pool;
}

const VALID_ENTITY_TYPES = ['committee', 'person', 'organization'] as const;
const VALID_COMMITTEE_TYPES = ['pac', 'super_pac', 'party', 'candidate', 'joint_fundraising'] as const;

const LeaderboardQuerySchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  election_cycle: z.string().regex(/^\d{4}$/, 'Must be a 4-digit year').optional(),
  entity_type: z.enum(VALID_ENTITY_TYPES).optional(),
  committee_type: z.enum(VALID_COMMITTEE_TYPES).optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export function registerLeaderboardRoute(server: FastifyInstance, deps: LeaderboardDeps): void {
  server.get('/api/v1/leaderboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = LeaderboardQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const { start_date, end_date, election_cycle, entity_type, committee_type, limit } = parsed.data;

    // Build WHERE conditions
    const conditions: string[] = ['d.is_memo = false'];
    const params: unknown[] = [];
    let paramIdx = 1;

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
    if (election_cycle) {
      conditions.push(`d.election_cycle = $${paramIdx}`);
      params.push(election_cycle);
      paramIdx++;
    }
    if (entity_type) {
      conditions.push(`d.source_entity_type = $${paramIdx}`);
      params.push(entity_type);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // For committee_type filtering, we need a join to the committee table.
    // We use a CTE approach: aggregate donations then join for names + optional committee_type filter.
    const committeeTypeCondition = committee_type
      ? `AND c.committee_type = $${paramIdx}`
      : '';
    if (committee_type) {
      params.push(committee_type);
      paramIdx++;
    }

    params.push(limit);
    const limitParam = `$${paramIdx}`;

    const query = `
      WITH donor_totals AS (
        SELECT
          d.source_entity_id AS entity_id,
          d.source_entity_type AS entity_type,
          SUM(d.amount) AS total_amount,
          COUNT(*) AS donation_count
        FROM donation d
        ${whereClause}
        GROUP BY d.source_entity_id, d.source_entity_type
      )
      SELECT
        dt.entity_id,
        dt.entity_type,
        dt.total_amount,
        dt.donation_count,
        COALESCE(p.canonical_name, c.name, o.name) AS name,
        c.committee_type
      FROM donor_totals dt
      LEFT JOIN person p ON dt.entity_type = 'person' AND p.id = dt.entity_id
      LEFT JOIN committee c ON dt.entity_type = 'committee' AND c.id = dt.entity_id
      LEFT JOIN organization o ON dt.entity_type = 'organization' AND o.id = dt.entity_id
      WHERE COALESCE(p.id, c.id, o.id) IS NOT NULL
        ${committeeTypeCondition}
      ORDER BY dt.total_amount DESC
      LIMIT ${limitParam}
    `;

    const result = await deps.pool.query(query, params);

    const entries = result.rows.map((r) => ({
      entity_id: r.entity_id,
      entity_type: r.entity_type,
      name: r.name,
      committee_type: r.committee_type ?? null,
      total_amount: parseFloat(r.total_amount),
      donation_count: parseInt(r.donation_count, 10),
    }));

    const meta = buildMeta(request, {
      total_count: entries.length,
      page: 1,
      page_size: limit,
    });

    return sendResponse(reply, { entries }, meta);
  });
}
