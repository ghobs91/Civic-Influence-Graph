/**
 * Saved queries API routes (T078+T079).
 *   POST /api/v1/saved-queries          — Create a saved query (bearer auth)
 *   GET  /api/v1/saved-queries/:id      — Retrieve a saved query
 *   GET  /api/v1/saved-queries/:id/execute — Re-execute against current data
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { buildMeta, sendResponse } from '../middleware/response.js';

export interface SavedQueryDeps {
  pool: pg.Pool;
  bearerTokens: Set<string>;
}

const CreateSavedQuerySchema = z.object({
  name: z.string().min(1).max(200),
  query_type: z.enum(['graph', 'search', 'table']),
  query_config: z.record(z.unknown()),
});

const SavedQueryIdSchema = z.object({
  id: z.string().uuid(),
});

function validateBearer(request: FastifyRequest, reply: FastifyReply, tokens: Set<string>): boolean {
  const authHeader = request.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || !tokens.has(token)) {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Valid bearer token required',
        request_id: request.id as string,
      },
    });
    return false;
  }
  return true;
}

export function registerSavedQueryRoutes(server: FastifyInstance, deps: SavedQueryDeps): void {
  /**
   * POST /api/v1/saved-queries — Create a saved query (authenticated)
   */
  server.post('/api/v1/saved-queries', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!validateBearer(request, reply, deps.bearerTokens)) return;

    const parsed = CreateSavedQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const { name, query_type, query_config } = parsed.data;

    const result = await deps.pool.query<{ id: string; created_at: string; updated_at: string }>(
      `INSERT INTO saved_query (name, query_type, query_config)
       VALUES ($1, $2, $3)
       RETURNING id, created_at, updated_at`,
      [name, query_type, JSON.stringify(query_config)],
    );

    const row = result.rows[0];
    const savedQuery = {
      id: row.id,
      name,
      query_type,
      query_config,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    const meta = buildMeta(request, { total_count: 1, page: 1, page_size: 1 });
    return reply.status(201).send({ data: savedQuery, meta });
  });

  /**
   * GET /api/v1/saved-queries/:id — Retrieve a saved query (authenticated)
   */
  server.get('/api/v1/saved-queries/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!validateBearer(request, reply, deps.bearerTokens)) return;
    const parsed = SavedQueryIdSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const result = await deps.pool.query(
      `SELECT id, name, query_type, query_config, created_at, updated_at
       FROM saved_query WHERE id = $1`,
      [parsed.data.id],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Saved query not found',
          request_id: request.id as string,
        },
      });
    }

    const row = result.rows[0];
    const meta = buildMeta(request, { total_count: 1, page: 1, page_size: 1 });
    return sendResponse(reply, row, meta);
  });

  /**
   * GET /api/v1/saved-queries/:id/execute — Re-execute a saved query (authenticated)
   */
  server.get('/api/v1/saved-queries/:id/execute', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!validateBearer(request, reply, deps.bearerTokens)) return;
    const parsed = SavedQueryIdSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const result = await deps.pool.query(
      `SELECT id, name, query_type, query_config FROM saved_query WHERE id = $1`,
      [parsed.data.id],
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Saved query not found',
          request_id: request.id as string,
        },
      });
    }

    const saved = result.rows[0];
    const config = saved.query_config as Record<string, unknown>;

    let queryResult: unknown;

    switch (saved.query_type) {
      case 'search': {
        const q = (config.q as string) ?? '';
        const entityType = (config.type as string) ?? null;
        const jurisdiction = (config.jurisdiction as string) ?? null;
        const page = (config.page as number) ?? 1;
        const pageSize = (config.page_size as number) ?? 20;

        const conditions: string[] = [];
        const params: unknown[] = [];
        let paramIdx = 1;

        if (q) {
          conditions.push(`p.canonical_name ILIKE $${paramIdx}`);
          params.push(`%${q}%`);
          paramIdx++;
        }
        if (entityType) {
          conditions.push(`p.entity_type = $${paramIdx}`);
          params.push(entityType);
          paramIdx++;
        }
        if (jurisdiction) {
          conditions.push(`$${paramIdx} = ANY(p.jurisdictions)`);
          params.push(jurisdiction);
          paramIdx++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const offset = (page - 1) * pageSize;
        params.push(pageSize, offset);

        const searchResult = await deps.pool.query(
          `SELECT id, canonical_name, entity_type, party, jurisdictions
           FROM person ${whereClause}
           ORDER BY canonical_name
           LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
          params,
        );
        queryResult = { results: searchResult.rows };
        break;
      }

      case 'graph':
      case 'table': {
        // Re-execute as a simple donation-based edge query
        const entityId = config.center_entity_id as string | undefined;
        const params: unknown[] = [];
        let paramIdx = 1;
        const conditions: string[] = [];

        if (entityId) {
          conditions.push(`(d.source_entity_id = $${paramIdx} OR d.destination_entity_id = $${paramIdx})`);
          params.push(entityId);
          paramIdx++;
        }
        if (config.start_date) {
          conditions.push(`d.transaction_date >= $${paramIdx}`);
          params.push(config.start_date);
          paramIdx++;
        }
        if (config.end_date) {
          conditions.push(`d.transaction_date <= $${paramIdx}`);
          params.push(config.end_date);
          paramIdx++;
        }
        if (config.min_amount) {
          conditions.push(`d.amount >= $${paramIdx}`);
          params.push(config.min_amount);
          paramIdx++;
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = Math.min((config.max_nodes as number) ?? 100, 500);
        params.push(limit);

        const edgeResult = await deps.pool.query(
          `SELECT d.id, d.source_entity_id, d.destination_entity_id,
                  d.amount, d.transaction_date, d.election_cycle
           FROM donation d ${whereClause}
           ORDER BY d.amount DESC
           LIMIT $${paramIdx}`,
          params,
        );
        queryResult = { edges: edgeResult.rows };
        break;
      }

      default:
        return reply.status(400).send({
          error: {
            code: 'INVALID_QUERY_TYPE',
            message: `Unsupported query type: ${saved.query_type as string}`,
            request_id: request.id as string,
          },
        });
    }

    const meta = buildMeta(request, { total_count: 1, page: 1, page_size: 1 });
    return sendResponse(reply, { saved_query: saved, results: queryResult }, meta);
  });
}
