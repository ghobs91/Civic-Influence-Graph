import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { extractState, registerBallotRoutes, type BallotDeps } from '../routes/ballot.js';

// ============================================================
// extractState
// ============================================================

describe('extractState', () => {
  it('returns explicit state when valid', () => {
    expect(extractState('123 Main St', 'CA')).toBe('CA');
  });

  it('uppercases explicit state', () => {
    expect(extractState('123 Main St', 'ca')).toBe('CA');
  });

  it('rejects invalid explicit state (too long)', () => {
    expect(extractState('123 Main St', 'CAL')).toBeNull();
  });

  it('extracts state from address text', () => {
    expect(extractState('123 Main St, San Francisco, CA 94102')).toBe('CA');
  });

  it('returns null for address without state', () => {
    expect(extractState('123 Main Street, Somewhere')).toBeNull();
  });

  it('extracts DC', () => {
    expect(extractState('1600 Pennsylvania Ave, Washington, DC 20500')).toBe('DC');
  });
});

// ============================================================
// registerBallotRoutes (integration)
// ============================================================

describe('registerBallotRoutes', () => {
  let mockPool: { query: ReturnType<typeof vi.fn> };
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    server = Fastify();
    registerBallotRoutes(server, { pool: mockPool as unknown as BallotDeps['pool'] });
    await server.ready();
  });

  it('returns 400 for missing address', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ballot/races',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when state cannot be determined', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ballot/races?address=123+Main+Street',
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('STATE_NOT_FOUND');
  });

  it('returns races when state can be determined', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ballot/races?address=123+Main+St+CA+90001',
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.races).toEqual([]);
  });

  it('returns structured races with candidate data', async () => {
    // First call: candidates
    mockPool.query
      .mockResolvedValueOnce({
        rows: [{
          id: '550e8400-e29b-41d4-a716-446655440000',
          canonical_name: 'Jane Smith',
          party: 'D',
          office: 'representative',
          district: '12',
        }],
      })
      // Funding total
      .mockResolvedValueOnce({ rows: [{ total_received: '1500000' }] })
      // Sector breakdown
      .mockResolvedValueOnce({ rows: [{ sector_name: 'Defense', total: '450000' }] })
      // Top donors
      .mockResolvedValueOnce({ rows: [{ donor_name: 'ACME PAC', total: '50000' }] });

    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/ballot/races?address=123+Main+St+CA+90001',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.races).toHaveLength(1);
    expect(body.data.races[0].office).toBe('US House - CA-12');
    expect(body.data.races[0].candidates[0].name).toBe('Jane Smith');
    expect(body.data.races[0].candidates[0].summary.total_raised).toBe(1500000);
    expect(body.data.races[0].candidates[0].summary.top_sectors[0].sector).toBe('Defense');
    expect(body.data.races[0].candidates[0].summary.top_donors[0].name).toBe('ACME PAC');
  });
});
