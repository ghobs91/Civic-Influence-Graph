/**
 * AI audit log API routes (T053):
 *   GET  /ai/audit-log  — List audit entries with date filtering + pagination
 *   POST /ai/audit-log  — Save a new audit entry from the client
 *
 * All queries use parameterized SQL to prevent injection.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { AuditLogEntrySchema, AuditLogQuerySchema } from '@cig/schema';
import { buildMeta, sendResponse } from '../middleware/response.js';

export interface AIDeps {
  pool: pg.Pool;
}

export function registerAIRoutes(server: FastifyInstance, deps: AIDeps): void {
  // ============================================================
  // GET /api/v1/ai/audit-log — List audit entries
  // ============================================================

  server.get('/api/v1/ai/audit-log', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = AuditLogQuerySchema.parse(request.query);
    const { page, page_size, start_date, end_date } = query;
    const offset = (page - 1) * page_size;

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (start_date) {
      conditions.push(`timestamp >= $${paramIdx++}`);
      params.push(start_date);
    }
    if (end_date) {
      conditions.push(`timestamp <= $${paramIdx++}`);
      params.push(end_date);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countResult = await deps.pool.query(
      `SELECT COUNT(*)::int AS total FROM ai_audit_log ${where}`,
      params,
    );
    const totalCount = countResult.rows[0]?.total ?? 0;

    // Data query
    const dataParams = [...params, page_size, offset];
    const dataResult = await deps.pool.query(
      `SELECT id, timestamp, natural_language_query, generated_query,
              query_params, model_id, model_version, result_count, client_info
       FROM ai_audit_log ${where}
       ORDER BY timestamp DESC
       LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      dataParams,
    );

    const meta = buildMeta(request, { total_count: totalCount, page, page_size });
    return sendResponse(reply, { entries: dataResult.rows }, meta);
  });

  // ============================================================
  // POST /api/v1/ai/audit-log — Save a new audit entry
  // ============================================================

  server.post('/api/v1/ai/audit-log', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = AuditLogEntrySchema.parse(request.body);

    const result = await deps.pool.query(
      `INSERT INTO ai_audit_log
         (natural_language_query, generated_query, query_params,
          model_id, model_version, result_count, client_info)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, timestamp`,
      [
        body.natural_language_query,
        body.generated_query,
        body.query_params ? JSON.stringify(body.query_params) : null,
        body.model_id,
        body.model_version,
        body.result_count ?? null,
        body.client_info ? JSON.stringify(body.client_info) : null,
      ],
    );

    const row = result.rows[0];
    const meta = buildMeta(request, { total_count: 1, page: 1, page_size: 1 });
    return reply.status(201).send({
      data: { id: row.id, saved_at: row.timestamp },
      meta,
    });
  });
}
