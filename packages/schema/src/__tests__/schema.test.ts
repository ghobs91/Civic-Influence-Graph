import { describe, it, expect } from 'vitest';
import {
  PersonSchema,
  CommitteeSchema,
  OrganizationSchema,
  BillSchema,
  SectorSchema,
  DonationSchema,
  VoteSchema,
  AffiliationSchema,
  LobbyingEngagementSchema,
  SearchQuerySchema,
  GraphQuerySchema,
  ApiResponseSchema,
  ApiErrorSchema,
} from '../index.js';
import { z } from 'zod';

describe('Entity Schemas', () => {
  const validPerson = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    source_ids: [{ source: 'fec', external_id: 'H8CA52116' }],
    canonical_name: 'Jane Smith',
    name_variants: ['SMITH, JANE A.'],
    entity_type: 'legislator' as const,
    party: 'D',
    jurisdictions: ['federal', 'CA'],
    roles: [{ role: 'representative', body: 'US House', state: 'CA' }],
    committee_memberships: [],
    employer: null,
    occupation: null,
    created_at: '2026-03-15T00:00:00Z',
    updated_at: '2026-03-25T12:00:00Z',
    merge_history: [],
  };

  it('validates a valid person', () => {
    const result = PersonSchema.safeParse(validPerson);
    expect(result.success).toBe(true);
  });

  it('rejects a person with empty canonical_name', () => {
    const result = PersonSchema.safeParse({ ...validPerson, canonical_name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a person with invalid entity_type', () => {
    const result = PersonSchema.safeParse({ ...validPerson, entity_type: 'alien' });
    expect(result.success).toBe(false);
  });

  it('rejects a person with invalid UUID', () => {
    const result = PersonSchema.safeParse({ ...validPerson, id: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('validates a valid committee', () => {
    const committee = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      source_ids: [{ source: 'fec', external_id: 'C00431445' }],
      name: 'Friends of Jane Smith',
      name_variants: [],
      committee_type: 'candidate' as const,
      designation: 'P',
      jurisdiction: 'federal',
      treasurer: 'John Doe',
      associated_candidate_id: '550e8400-e29b-41d4-a716-446655440000',
      filing_frequency: 'Q',
      active_from: '2020-01-01',
      active_to: null,
      created_at: '2026-03-15T00:00:00Z',
      updated_at: '2026-03-25T12:00:00Z',
    };
    const result = CommitteeSchema.safeParse(committee);
    expect(result.success).toBe(true);
  });

  it('validates a valid sector', () => {
    const sector = {
      id: '550e8400-e29b-41d4-a716-446655440010',
      name: 'Defense',
      code: 'DEF',
      parent_sector_id: null,
      description: 'Defense sector',
    };
    const result = SectorSchema.safeParse(sector);
    expect(result.success).toBe(true);
  });
});

describe('Relationship Schemas', () => {
  it('validates a valid donation', () => {
    const donation = {
      id: '550e8400-e29b-41d4-a716-446655440020',
      source_entity_id: '550e8400-e29b-41d4-a716-446655440000',
      source_entity_type: 'person' as const,
      destination_entity_id: '550e8400-e29b-41d4-a716-446655440001',
      amount: 2800.0,
      transaction_date: '2025-10-15',
      election_cycle: '2026',
      transaction_type: 'direct_contribution',
      fec_transaction_type: '15',
      is_memo: false,
      filing_id: 'FEC-12345678',
      amendment_chain: [],
      source_system: 'fec',
      source_record_id: '4123456789',
      created_at: '2026-03-15T00:00:00Z',
      updated_at: '2026-03-25T12:00:00Z',
    };
    const result = DonationSchema.safeParse(donation);
    expect(result.success).toBe(true);
  });

  it('rejects a donation with negative amount', () => {
    const donation = {
      id: '550e8400-e29b-41d4-a716-446655440020',
      source_entity_id: '550e8400-e29b-41d4-a716-446655440000',
      source_entity_type: 'person' as const,
      destination_entity_id: '550e8400-e29b-41d4-a716-446655440001',
      amount: -100,
      transaction_date: '2025-10-15',
      election_cycle: '2026',
      transaction_type: null,
      fec_transaction_type: null,
      is_memo: false,
      filing_id: null,
      amendment_chain: [],
      source_system: 'fec',
      source_record_id: null,
      created_at: '2026-03-15T00:00:00Z',
      updated_at: '2026-03-25T12:00:00Z',
    };
    const result = DonationSchema.safeParse(donation);
    expect(result.success).toBe(false);
  });

  it('validates a valid vote', () => {
    const vote = {
      id: '550e8400-e29b-41d4-a716-446655440030',
      person_id: '550e8400-e29b-41d4-a716-446655440000',
      bill_id: '550e8400-e29b-41d4-a716-446655440005',
      vote_cast: 'yea' as const,
      vote_date: '2025-06-15',
      roll_call_number: '234',
      session: '118',
      chamber: 'house' as const,
      source_system: 'congress_gov',
      source_record_id: 'roll-234-118',
      created_at: '2026-03-15T00:00:00Z',
      updated_at: '2026-03-25T12:00:00Z',
    };
    const result = VoteSchema.safeParse(vote);
    expect(result.success).toBe(true);
  });
});

describe('Query Parameter Schemas', () => {
  it('validates a search query with defaults', () => {
    const result = SearchQuerySchema.safeParse({ q: 'jane smith' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.page_size).toBe(20);
    }
  });

  it('rejects empty search query', () => {
    const result = SearchQuerySchema.safeParse({ q: '' });
    expect(result.success).toBe(false);
  });

  it('coerces string page numbers', () => {
    const result = SearchQuerySchema.safeParse({ q: 'test', page: '3', page_size: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.page_size).toBe(50);
    }
  });

  it('rejects page_size exceeding max', () => {
    const result = SearchQuerySchema.safeParse({ q: 'test', page_size: 200 });
    expect(result.success).toBe(false);
  });

  it('validates a graph query with defaults', () => {
    const result = GraphQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_nodes).toBe(100);
    }
  });

  it('rejects max_nodes exceeding limit', () => {
    const result = GraphQuerySchema.safeParse({ max_nodes: 1000 });
    expect(result.success).toBe(false);
  });
});

describe('API Envelope Schemas', () => {
  it('validates API error response', () => {
    const error = {
      error: {
        code: 'NOT_FOUND',
        message: 'Entity not found',
        request_id: '550e8400-e29b-41d4-a716-446655440099',
      },
    };
    const result = ApiErrorSchema.safeParse(error);
    expect(result.success).toBe(true);
  });
});
