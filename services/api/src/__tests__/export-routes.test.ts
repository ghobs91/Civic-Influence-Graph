import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerExportRoutes, getSnapshotStore, type ExportDeps } from '../routes/export.js';

describe('registerExportRoutes', () => {
  let server: ReturnType<typeof Fastify>;
  const apiKeys = new Set(['test-api-key-123']);
  let mockPool: { query: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    // Clear the snapshot store between tests
    getSnapshotStore().clear();

    mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ data: { id: '1', name: 'Test' } }],
      }),
    };

    server = Fastify();
    registerExportRoutes(server, {
      pool: mockPool as unknown as ExportDeps['pool'],
      apiKeys,
    });
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('GET /api/v1/export/snapshots', () => {
    it('returns empty list initially', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/export/snapshots',
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.snapshots).toEqual([]);
    });
  });

  describe('POST /api/v1/export/snapshots', () => {
    it('requires API key', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/export/snapshots',
      });
      expect(res.statusCode).toBe(401);
    });

    it('generates a snapshot with valid API key', async () => {
      const res = await server.inject({
        method: 'POST',
        url: '/api/v1/export/snapshots',
        headers: { authorization: 'Bearer test-api-key-123' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.snapshot.id).toBeDefined();
      expect(body.data.snapshot.total_records).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/export/snapshots/:id/download', () => {
    it('requires API key', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/export/snapshots/test-id/download',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for unknown snapshot', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/export/snapshots/nonexistent/download',
        headers: { authorization: 'Bearer test-api-key-123' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('downloads an existing snapshot', async () => {
      // Create a snapshot first
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/export/snapshots',
        headers: { authorization: 'Bearer test-api-key-123' },
      });
      const snapshotId = JSON.parse(createRes.payload).data.snapshot.id;

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/export/snapshots/${snapshotId}/download`,
        headers: { authorization: 'Bearer test-api-key-123' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.manifest).toBeDefined();
      expect(body.files).toBeDefined();
      expect(body.files.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/export/snapshots/:id/changelog', () => {
    it('requires API key', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/export/snapshots/nonexistent/changelog',
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns 404 for unknown snapshot', async () => {
      const res = await server.inject({
        method: 'GET',
        url: '/api/v1/export/snapshots/nonexistent/changelog',
        headers: { authorization: 'Bearer test-api-key-123' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns changelog for existing snapshot', async () => {
      // Create a snapshot first
      const createRes = await server.inject({
        method: 'POST',
        url: '/api/v1/export/snapshots',
        headers: { authorization: 'Bearer test-api-key-123' },
      });
      const snapshotId = JSON.parse(createRes.payload).data.snapshot.id;

      const res = await server.inject({
        method: 'GET',
        url: `/api/v1/export/snapshots/${snapshotId}/changelog`,
        headers: { authorization: 'Bearer test-api-key-123' },
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data.changelog).toBeDefined();
      expect(body.data.changelog.added).toBeGreaterThanOrEqual(0);
    });
  });
});
