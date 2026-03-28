/**
 * Bulk export API routes (T077).
 *   GET  /api/v1/export/snapshots            — List available snapshots
 *   GET  /api/v1/export/snapshots/:id/download   — Download a snapshot
 *   GET  /api/v1/export/snapshots/:id/changelog  — Get changelog vs previous
 *
 * API key authentication required for download (rate-limited).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { buildMeta, sendResponse } from '../middleware/response.js';
import { generateSnapshot } from '../services/snapshot.js';
import { generateChangelog } from '../services/changelog.js';
import type { SnapshotManifest, SnapshotFile } from '../services/snapshot.js';

export interface ExportDeps {
  pool: pg.Pool;
  apiKeys: Set<string>;
}

const SnapshotIdSchema = z.object({
  id: z.string().min(1).max(64),
});

/**
 * In-memory snapshot store. In production this would use a persistent store.
 */
const snapshotStore = new Map<string, { manifest: SnapshotManifest; files: SnapshotFile[] }>();

function validateApiKey(request: FastifyRequest, reply: FastifyReply, apiKeys: Set<string>): boolean {
  const authHeader = request.headers.authorization ?? '';
  const key = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!key || !apiKeys.has(key)) {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Valid API key required for bulk export',
        request_id: request.id as string,
      },
    });
    return false;
  }
  return true;
}

export function registerExportRoutes(server: FastifyInstance, deps: ExportDeps): void {
  /**
   * GET /api/v1/export/snapshots — List available snapshots
   */
  server.get('/api/v1/export/snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    const snapshots = Array.from(snapshotStore.values()).map(({ manifest }) => ({
      id: manifest.id,
      created_at: manifest.created_at,
      election_cycles: manifest.election_cycles,
      data_sources: manifest.data_sources,
      record_counts: manifest.record_counts,
      format: 'jsonl.gz',
      size_bytes: manifest.total_size_bytes,
      download_url: `/api/v1/export/snapshots/${manifest.id}/download`,
      change_log_url: `/api/v1/export/snapshots/${manifest.id}/changelog`,
    }));

    const meta = buildMeta(request, {
      total_count: snapshots.length,
      page: 1,
      page_size: snapshots.length,
    });

    return sendResponse(reply, { snapshots }, meta);
  });

  /**
   * POST /api/v1/export/snapshots — Generate a new snapshot (authenticated)
   */
  server.post('/api/v1/export/snapshots', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!validateApiKey(request, reply, deps.apiKeys)) return;

    const result = await generateSnapshot(deps.pool);
    snapshotStore.set(result.manifest.id, result);

    const meta = buildMeta(request, {
      total_count: 1,
      page: 1,
      page_size: 1,
    });

    return sendResponse(reply, { snapshot: result.manifest }, meta);
  });

  /**
   * GET /api/v1/export/snapshots/:id/download — Download snapshot (authenticated)
   */
  server.get('/api/v1/export/snapshots/:id/download', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!validateApiKey(request, reply, deps.apiKeys)) return;

    const parsed = SnapshotIdSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const snapshot = snapshotStore.get(parsed.data.id);
    if (!snapshot) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Snapshot not found',
          request_id: request.id as string,
        },
      });
    }

    return reply
      .header('content-type', 'application/json')
      .send({
        manifest: snapshot.manifest,
        files: snapshot.files.map((f) => ({
          path: f.path,
          table: f.table,
          record_count: f.recordCount,
          checksum_sha256: f.checksum,
          size_bytes: f.data.length,
          data_base64: f.data.toString('base64'),
        })),
      });
  });

  /**
   * GET /api/v1/export/snapshots/:id/changelog — Changelog vs previous snapshot (authenticated)
   */
  server.get('/api/v1/export/snapshots/:id/changelog', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!validateApiKey(request, reply, deps.apiKeys)) return;
    const parsed = SnapshotIdSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map((i) => i.message).join('; '),
          request_id: request.id as string,
        },
      });
    }

    const snapshot = snapshotStore.get(parsed.data.id);
    if (!snapshot) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Snapshot not found',
          request_id: request.id as string,
        },
      });
    }

    // Find previous snapshot by creation date
    const allSnapshots = Array.from(snapshotStore.values())
      .sort((a, b) => a.manifest.created_at.localeCompare(b.manifest.created_at));
    const currentIdx = allSnapshots.findIndex((s) => s.manifest.id === parsed.data.id);
    const prevSnapshot = currentIdx > 0 ? allSnapshots[currentIdx - 1] : null;

    const changelog = generateChangelog(
      prevSnapshot?.files ?? null,
      snapshot.files,
    );

    const meta = buildMeta(request, {
      total_count: changelog.entries.length,
      page: 1,
      page_size: changelog.entries.length,
    });

    return sendResponse(reply, { changelog }, meta);
  });
}

/**
 * Access the snapshot store for testing purposes.
 */
export function getSnapshotStore(): Map<string, { manifest: SnapshotManifest; files: SnapshotFile[] }> {
  return snapshotStore;
}
