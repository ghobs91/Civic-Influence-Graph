import { describe, it, expect, vi } from 'vitest';
import {
  buildPersonDocument,
  buildCommitteeDocument,
  buildOrganizationDocument,
  bulkIndexDocuments,
  type EntityDocument,
  type PersonRow,
  type CommitteeRow,
  type OrganizationRow,
} from '../indexer.js';

// ============================================================
// buildPersonDocument
// ============================================================

describe('buildPersonDocument', () => {
  it('builds correct document from person row', () => {
    const row: PersonRow = {
      id: 'uuid-1',
      canonical_name: 'john smith',
      name_variants: ['SMITH, JOHN', 'John Smith'],
      entity_type: 'legislator',
      party: 'D',
      jurisdictions: ['CA', 'federal'],
      employer: null,
    };

    const doc = buildPersonDocument(row);
    expect(doc.id).toBe('uuid-1');
    expect(doc.entity_type).toBe('person:legislator');
    expect(doc.canonical_name).toBe('john smith');
    expect(doc.name_variants).toEqual(['SMITH, JOHN', 'John Smith']);
    expect(doc.jurisdiction).toBe('CA');
    expect(doc.party).toBe('D');
    expect(doc.employer).toBeNull();
    expect(doc.committee_name).toBeNull();
  });

  it('handles empty jurisdictions', () => {
    const row: PersonRow = {
      id: 'uuid-2',
      canonical_name: 'jane doe',
      name_variants: [],
      entity_type: 'donor',
      party: null,
      jurisdictions: [],
      employer: 'ACME INC',
    };

    const doc = buildPersonDocument(row);
    expect(doc.jurisdiction).toBeNull();
    expect(doc.employer).toBe('ACME INC');
  });
});

// ============================================================
// buildCommitteeDocument
// ============================================================

describe('buildCommitteeDocument', () => {
  it('builds correct document from committee row', () => {
    const row: CommitteeRow = {
      id: 'uuid-3',
      name: 'Smith For Congress',
      name_variants: ['SMITH FOR CONGRESS'],
      committee_type: 'candidate',
      jurisdiction: 'CA',
    };

    const doc = buildCommitteeDocument(row);
    expect(doc.id).toBe('uuid-3');
    expect(doc.entity_type).toBe('committee:candidate');
    expect(doc.canonical_name).toBe('Smith For Congress');
    expect(doc.committee_name).toBe('Smith For Congress');
    expect(doc.party).toBeNull();
  });
});

// ============================================================
// buildOrganizationDocument
// ============================================================

describe('buildOrganizationDocument', () => {
  it('builds correct document from organization row', () => {
    const row: OrganizationRow = {
      id: 'uuid-4',
      name: 'Acme Corp',
      name_variants: ['ACME CORPORATION'],
      org_type: 'corporation',
      jurisdiction: 'DE',
      sector_name: 'Technology',
    };

    const doc = buildOrganizationDocument(row);
    expect(doc.id).toBe('uuid-4');
    expect(doc.entity_type).toBe('organization:corporation');
    expect(doc.sector).toBe('Technology');
    expect(doc.jurisdiction).toBe('DE');
  });

  it('handles null sector', () => {
    const row: OrganizationRow = {
      id: 'uuid-5',
      name: 'Small LLC',
      name_variants: [],
      org_type: 'other',
      jurisdiction: null,
      sector_name: null,
    };

    const doc = buildOrganizationDocument(row);
    expect(doc.sector).toBeNull();
  });
});

// ============================================================
// bulkIndexDocuments
// ============================================================

describe('bulkIndexDocuments', () => {
  it('sends documents in correct bulk format', async () => {
    const mockClient = {
      bulk: vi.fn().mockResolvedValue({
        body: { errors: false, items: [{ index: { status: 201 } }] },
      }),
    };

    const docs: EntityDocument[] = [
      {
        id: 'uuid-1',
        entity_type: 'person:legislator',
        canonical_name: 'john smith',
        name_variants: ['SMITH, JOHN'],
        jurisdiction: 'CA',
        sector: null,
        party: 'D',
        employer: null,
        committee_name: null,
      },
    ];

    const stats = await bulkIndexDocuments(mockClient as never, docs);
    expect(stats.indexed).toBe(1);
    expect(stats.errors).toBe(0);
    expect(stats.total).toBe(1);

    const bulkCall = mockClient.bulk.mock.calls[0][0];
    expect(bulkCall.body[0]).toEqual({ index: { _index: 'cig-entities', _id: 'uuid-1' } });
    expect(bulkCall.body[1]).toEqual(docs[0]);
  });

  it('counts errors from bulk response', async () => {
    const mockClient = {
      bulk: vi.fn().mockResolvedValue({
        body: {
          errors: true,
          items: [
            { index: { status: 201 } },
            { index: { status: 400, error: { reason: 'parse error' } } },
          ],
        },
      }),
    };

    const docs: EntityDocument[] = [
      { id: '1', entity_type: 'person:other', canonical_name: 'a', name_variants: [], jurisdiction: null, sector: null, party: null, employer: null, committee_name: null },
      { id: '2', entity_type: 'person:other', canonical_name: 'b', name_variants: [], jurisdiction: null, sector: null, party: null, employer: null, committee_name: null },
    ];

    const stats = await bulkIndexDocuments(mockClient as never, docs);
    expect(stats.indexed).toBe(1);
    expect(stats.errors).toBe(1);
  });

  it('calls onProgress callback', async () => {
    const mockClient = {
      bulk: vi.fn().mockResolvedValue({
        body: { errors: false, items: [{ index: { status: 201 } }] },
      }),
    };

    const docs: EntityDocument[] = [
      { id: '1', entity_type: 'person:other', canonical_name: 'a', name_variants: [], jurisdiction: null, sector: null, party: null, employer: null, committee_name: null },
    ];

    const onProgress = vi.fn();
    await bulkIndexDocuments(mockClient as never, docs, onProgress);
    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });
});
