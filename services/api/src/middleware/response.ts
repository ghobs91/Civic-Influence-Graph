import { FastifyReply, FastifyRequest } from 'fastify';
import type { PaginationMeta } from '@cig/schema';
import crypto from 'node:crypto';

/**
 * Build a standard provenance metadata envelope for API responses.
 */
export function buildMeta(
  request: FastifyRequest,
  opts: { total_count: number; page: number; page_size: number }
): PaginationMeta {
  return {
    request_id: (request.id as string) || crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    data_snapshot: null,
    total_count: opts.total_count,
    page: opts.page,
    page_size: opts.page_size,
  };
}

/**
 * Send a standard paginated API response.
 */
export function sendResponse<T>(
  reply: FastifyReply,
  data: T,
  meta: PaginationMeta
): FastifyReply {
  return reply.send({ data, meta });
}
