import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  search,
  getEntity,
  getDashboard,
  getDonations,
  getLobbying,
  getVotes,
  ApiClientError,
} from '../lib/api-client.js';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

const meta = {
  request_id: '00000000-0000-0000-0000-000000000001',
  timestamp: '2025-01-01T00:00:00Z',
  data_snapshot: null,
  total_count: 1,
  page: 1,
  page_size: 20,
};

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch({ data: {}, meta }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api-client', () => {
  describe('search', () => {
    it('calls /search with query params', async () => {
      const body = { data: { results: [{ id: 'a', canonical_name: 'Test', relevance_score: 0.9 }] }, meta };
      vi.stubGlobal('fetch', mockFetch(body));

      const res = await search({ q: 'test', type: 'person', page: 2 });

      expect(res.data.results).toHaveLength(1);
      expect(res.data.results[0].canonical_name).toBe('Test');

      const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(url.pathname).toBe('/api/v1/search');
      expect(url.searchParams.get('q')).toBe('test');
      expect(url.searchParams.get('type')).toBe('person');
      expect(url.searchParams.get('page')).toBe('2');
    });

    it('omits undefined params', async () => {
      await search({ q: 'hello' });

      const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(url.searchParams.has('type')).toBe(false);
      expect(url.searchParams.has('sector')).toBe(false);
    });
  });

  describe('getEntity', () => {
    it('calls /entities/:id', async () => {
      const entity = { id: 'abc-123', entity_type: 'person', canonical_name: 'Smith' };
      vi.stubGlobal('fetch', mockFetch({ data: entity, meta }));

      const res = await getEntity('abc-123');
      expect(res.data.canonical_name).toBe('Smith');

      const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(url.pathname).toBe('/api/v1/entities/abc-123');
    });

    it('encodes id with special characters', async () => {
      await getEntity('a/b c');
      const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(url.pathname).toContain('a%2Fb%20c');
    });
  });

  describe('getDashboard', () => {
    it('calls /entities/:id/dashboard with date params', async () => {
      const dashboard = { entity: { id: '1' }, funding_summary: {}, voting_summary: {} };
      vi.stubGlobal('fetch', mockFetch({ data: dashboard, meta }));

      await getDashboard('ent-1', { start_date: '2024-01-01', end_date: '2024-12-31' });

      const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(url.pathname).toBe('/api/v1/entities/ent-1/dashboard');
      expect(url.searchParams.get('start_date')).toBe('2024-01-01');
      expect(url.searchParams.get('end_date')).toBe('2024-12-31');
    });
  });

  describe('getDonations', () => {
    it('calls /entities/:id/donations with filters', async () => {
      vi.stubGlobal('fetch', mockFetch({ data: { donations: [] }, meta }));

      await getDonations('ent-1', { direction: 'received', min_amount: 1000, page: 3 });

      const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(url.pathname).toBe('/api/v1/entities/ent-1/donations');
      expect(url.searchParams.get('direction')).toBe('received');
      expect(url.searchParams.get('min_amount')).toBe('1000');
      expect(url.searchParams.get('page')).toBe('3');
    });
  });

  describe('getLobbying', () => {
    it('calls /entities/:id/lobbying', async () => {
      vi.stubGlobal('fetch', mockFetch({ data: { lobbying_engagements: [] }, meta }));

      await getLobbying('ent-1', { page: 2, page_size: 10 });

      const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(url.pathname).toBe('/api/v1/entities/ent-1/lobbying');
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('page_size')).toBe('10');
    });
  });

  describe('getVotes', () => {
    it('calls /entities/:id/votes', async () => {
      vi.stubGlobal('fetch', mockFetch({ data: { votes: [] }, meta }));

      await getVotes('ent-1');

      const url = new URL((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(url.pathname).toBe('/api/v1/entities/ent-1/votes');
    });
  });

  describe('error handling', () => {
    it('throws ApiClientError on non-ok response', async () => {
      const errBody = { error: { code: 'NOT_FOUND', message: 'Not found', request_id: '00000000-0000-0000-0000-000000000001' } };
      vi.stubGlobal('fetch', mockFetch(errBody, 404));

      await expect(getEntity('bad-id')).rejects.toThrow(ApiClientError);
      try {
        await getEntity('bad-id');
      } catch (e) {
        const err = e as ApiClientError;
        expect(err.status).toBe(404);
        expect(err.body?.error.code).toBe('NOT_FOUND');
      }
    });

    it('handles non-JSON error response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      }));

      await expect(getEntity('x')).rejects.toThrow(ApiClientError);
    });
  });
});
