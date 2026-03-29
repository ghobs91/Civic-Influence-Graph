import Fastify, { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import crypto from 'node:crypto';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import type { ApiError } from '@cig/schema';
import { getPool } from './db.js';
import { registerSearchRoute } from './routes/search.js';
import { bootstrapSearchIndex } from './services/search-bootstrap.js';
import { registerEntityRoutes } from './routes/entities.js';
import { registerGraphRoutes } from './routes/graph.js';
import { registerAIRoutes } from './routes/ai.js';
import { registerBallotRoutes } from './routes/ballot.js';
import { registerExportRoutes } from './routes/export.js';
import { registerSavedQueryRoutes } from './routes/saved-queries.js';
import { registerReplicationRoutes } from './routes/replication.js';
import { registerLeaderboardRoute } from './routes/leaderboard.js';
import { createReplicationAdapter, createNoopReplication } from './services/replication-adapter.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
    genReqId: () => crypto.randomUUID(),
  });

  // --- CORS ---
  // Require explicit CORS_ORIGIN in production; no wildcard fallback.
  const corsOrigin = process.env.CORS_ORIGIN;
  await server.register(cors, {
    origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // --- Rate Limiting ---
  // Trust X-Forwarded-For from proxy so each real client IP is limited.
  await server.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (forwarded) {
        const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
        return first.trim();
      }
      return req.ip;
    },
  });

  // --- Global Error Handler ---
  server.setErrorHandler(async (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = error.statusCode ?? 500;
    const errorResponse: ApiError = {
      error: {
        code: error.code ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Internal server error' : error.message,
        request_id: request.id as string,
      },
    };

    if (statusCode >= 500) {
      request.log.error(error);
    }

    return reply.status(statusCode).send(errorResponse);
  });

  // --- 404 Handler ---
  server.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const errorResponse: ApiError = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        request_id: request.id as string,
      },
    };
    return reply.status(404).send(errorResponse);
  });

  // --- Health Check ---
  server.get('/health', async () => ({ status: 'ok' }));

  // --- Security Headers ---
  server.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '0');
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  return server;
}

export async function startServer(): Promise<void> {
  const server = await buildServer();
  const host = process.env.API_HOST || '0.0.0.0';
  const port = parseInt(process.env.API_PORT || '3001', 10);

  // --- Dependency wiring ---
  const pool = getPool();

  const opensearch = new OpenSearchClient({
    node: `http://${process.env.OPENSEARCH_HOST || 'localhost'}:${process.env.OPENSEARCH_PORT || '9200'}`,
  });

  const apiKeys = new Set((process.env.EXPORT_API_KEYS || '').split(',').filter(Boolean));
  const bearerTokens = new Set((process.env.SAVED_QUERY_BEARER_TOKENS || '').split(',').filter(Boolean));

  // --- Bootstrap OpenSearch index ---
  await bootstrapSearchIndex(opensearch, server.log);

  // --- Register all routes ---
  registerSearchRoute(server, { opensearch });
  registerEntityRoutes(server, { pool });
  registerGraphRoutes(server, { pool });
  registerAIRoutes(server, { pool });
  registerBallotRoutes(server, { pool });
  registerExportRoutes(server, { pool, apiKeys });
  registerSavedQueryRoutes(server, { pool, bearerTokens });
  registerLeaderboardRoute(server, { pool });

  // Replication routes — proxy to P2P admin server when configured.
  const p2pAdminUrl = process.env.P2P_ADMIN_URL;
  const replicationDeps = p2pAdminUrl
    ? createReplicationAdapter(p2pAdminUrl)
    : createNoopReplication();
  registerReplicationRoutes(server, replicationDeps);

  await server.listen({ host, port });
}

startServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
