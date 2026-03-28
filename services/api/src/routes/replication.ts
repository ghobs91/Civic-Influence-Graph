/**
 * Replication admin API endpoints (T066).
 *   GET  /api/v1/replication/feeds           — List P2P feeds
 *   POST /api/v1/replication/feeds/:name/seed — Start/stop seeding
 *   POST /api/v1/replication/feeds/follow     — Follow remote feed
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FEED_NAMES, type FeedName } from '@cig/p2p-protocol';

export interface FeedStatus {
  name: string;
  publicKey: string;
  length: number;
  seeding: boolean;
  peers: number;
  bytesUploaded: number;
  lastSync: string | null;
}

export interface ReplicationDeps {
  getFeedStatuses: () => Promise<FeedStatus[]>;
  startSeeding: (name: string) => Promise<void>;
  stopSeeding: (name: string) => Promise<void>;
  followFeed: (publicKey: string) => Promise<{ name: string }>;
}

const VALID_FEED_NAMES = new Set(Object.values(FEED_NAMES));

export function registerReplicationRoutes(
  server: FastifyInstance,
  deps: ReplicationDeps,
): void {
  // ============================================================
  // GET /api/v1/replication/feeds
  // ============================================================
  server.get(
    '/api/v1/replication/feeds',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const feeds = await deps.getFeedStatuses();
      return reply.send({
        data: { feeds },
      });
    },
  );

  // ============================================================
  // POST /api/v1/replication/feeds/:name/seed
  // ============================================================
  server.post(
    '/api/v1/replication/feeds/:name/seed',
    async (request: FastifyRequest<{ Params: { name: string }; Body: { action?: string } }>, reply: FastifyReply) => {
      const { name } = request.params;

      if (!VALID_FEED_NAMES.has(name as FeedName)) {
        return reply.status(400).send({
          error: { code: 'INVALID_FEED', message: `Unknown feed: ${name}` },
        });
      }

      const action = (request.body as { action?: string })?.action ?? 'start';

      if (action === 'stop') {
        await deps.stopSeeding(name);
      } else {
        await deps.startSeeding(name);
      }

      return reply.send({
        data: { name, seeding: action !== 'stop' },
      });
    },
  );

  // ============================================================
  // POST /api/v1/replication/feeds/follow
  // ============================================================
  server.post(
    '/api/v1/replication/feeds/follow',
    async (request: FastifyRequest<{ Body: { public_key?: string } }>, reply: FastifyReply) => {
      const body = request.body as { public_key?: string };

      if (!body?.public_key || typeof body.public_key !== 'string') {
        return reply.status(400).send({
          error: { code: 'MISSING_KEY', message: 'public_key is required' },
        });
      }

      // Validate hex-encoded 32-byte key
      if (!/^[0-9a-f]{64}$/i.test(body.public_key)) {
        return reply.status(400).send({
          error: { code: 'INVALID_KEY', message: 'public_key must be a 64-character hex string' },
        });
      }

      const result = await deps.followFeed(body.public_key);
      return reply.status(201).send({
        data: { following: true, name: result.name },
      });
    },
  );
}
