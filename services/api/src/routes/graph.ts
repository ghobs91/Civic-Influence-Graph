/**
 * Graph API routes (T040, T041):
 *   POST /graph/query  — Execute filtered graph query, return nodes + edges
 *   GET  /graph/table  — Flat edge table with optional CSV export
 *
 * All inputs are validated via Zod schemas from @cig/schema.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { GraphQuerySchema } from '@cig/schema';
import { z } from 'zod';
import { queryGraph, queryTable, tableToCsv } from '../services/graph.js';
import { buildMeta, sendResponse } from '../middleware/response.js';

export interface GraphDeps {
  pool: pg.Pool;
}

// Table endpoint has additional query params beyond GraphQuery
const TableQuerySchema = GraphQuerySchema.extend({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(1000).default(50),
  format: z.enum(['json', 'csv']).default('json'),
  center_entity_id: z.string().uuid().optional(),
});

export function registerGraphRoutes(server: FastifyInstance, deps: GraphDeps): void {
  // ============================================================
  // POST /api/v1/graph/query — Graph visualization query
  // ============================================================
  server.post('/api/v1/graph/query', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request body is required',
          request_id: request.id as string,
        },
      });
    }

    // Map center_entity_id to entity_id for schema compatibility
    const input = {
      ...body,
      entity_id: body.center_entity_id ?? body.entity_id,
    };

    const parsed = GraphQuerySchema.safeParse(input);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const result = await queryGraph(deps.pool, parsed.data);

    const meta = buildMeta(request, {
      total_count: result.nodes.length + result.edges.length,
      page: 1,
      page_size: parsed.data.max_nodes,
    });

    return sendResponse(reply, result, meta);
  });

  // ============================================================
  // GET /api/v1/graph/table — Flat edge table (JSON or CSV)
  // ============================================================
  server.get('/api/v1/graph/table', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as Record<string, unknown>;

    // Parse comma-separated arrays
    const input: Record<string, unknown> = { ...query };
    if (typeof input.sectors === 'string') {
      input.sector = input.sectors;
      delete input.sectors;
    }
    if (typeof input.edge_types === 'string') {
      input.edge_types = (input.edge_types as string).split(',').map((s) => s.trim());
    }
    if (input.center_entity_id) {
      input.entity_id = input.center_entity_id;
    }

    const parsed = TableQuerySchema.safeParse(input);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const { format, center_entity_id, ...filters } = parsed.data;
    const result = await queryTable(deps.pool, {
      ...filters,
      entity_id: filters.entity_id ?? center_entity_id,
    });

    if (format === 'csv') {
      const csv = tableToCsv(result.rows);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="graph-table.csv"')
        .send(csv);
    }

    const meta = buildMeta(request, {
      total_count: result.total_count,
      page: parsed.data.page,
      page_size: parsed.data.page_size,
    });

    return sendResponse(reply, { rows: result.rows }, meta);
  });
}
