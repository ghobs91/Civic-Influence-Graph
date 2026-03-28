/**
 * OpenSearch entity indexer.
 *
 * Reads entities from PostgreSQL and bulk-indexes them into OpenSearch
 * for fuzzy entity search and disambiguation.
 *
 * Documents follow the cig-entities index mapping defined in index-config.ts.
 */

import { Client } from '@opensearch-project/opensearch';
import { CIG_ENTITIES_INDEX } from './index-config.js';

// ============================================================
// TYPES
// ============================================================

export interface EntityDocument {
  id: string;
  entity_type: string;
  canonical_name: string;
  name_variants: string[];
  jurisdiction: string | null;
  sector: string | null;
  party: string | null;
  employer: string | null;
  committee_name: string | null;
}

export interface IndexStats {
  indexed: number;
  errors: number;
  total: number;
}

// ============================================================
// DOCUMENT BUILDING
// ============================================================

export interface PersonRow {
  id: string;
  canonical_name: string;
  name_variants: string[];
  entity_type: string;
  party: string | null;
  jurisdictions: string[];
  employer: string | null;
}

export interface CommitteeRow {
  id: string;
  name: string;
  name_variants: string[];
  committee_type: string;
  jurisdiction: string | null;
}

export interface OrganizationRow {
  id: string;
  name: string;
  name_variants: string[];
  org_type: string;
  jurisdiction: string | null;
  sector_name: string | null;
}

/** Build an OpenSearch document from a person row. */
export function buildPersonDocument(row: PersonRow): EntityDocument {
  return {
    id: row.id,
    entity_type: `person:${row.entity_type}`,
    canonical_name: row.canonical_name,
    name_variants: row.name_variants,
    jurisdiction: row.jurisdictions[0] ?? null,
    sector: null,
    party: row.party,
    employer: row.employer,
    committee_name: null,
  };
}

/** Build an OpenSearch document from a committee row. */
export function buildCommitteeDocument(row: CommitteeRow): EntityDocument {
  return {
    id: row.id,
    entity_type: `committee:${row.committee_type}`,
    canonical_name: row.name,
    name_variants: row.name_variants,
    jurisdiction: row.jurisdiction,
    sector: null,
    party: null,
    employer: null,
    committee_name: row.name,
  };
}

/** Build an OpenSearch document from an organization row. */
export function buildOrganizationDocument(row: OrganizationRow): EntityDocument {
  return {
    id: row.id,
    entity_type: `organization:${row.org_type}`,
    canonical_name: row.name,
    name_variants: row.name_variants,
    jurisdiction: row.jurisdiction,
    sector: row.sector_name,
    party: null,
    employer: null,
    committee_name: null,
  };
}

// ============================================================
// BULK INDEXING
// ============================================================

const BULK_BATCH_SIZE = 500;

/**
 * Bulk-index an array of entity documents into OpenSearch.
 * Processes in batches of BULK_BATCH_SIZE to avoid oversized requests.
 */
export async function bulkIndexDocuments(
  client: Client,
  documents: EntityDocument[],
  onProgress?: (indexed: number, total: number) => void,
): Promise<IndexStats> {
  const stats: IndexStats = { indexed: 0, errors: 0, total: documents.length };

  for (let i = 0; i < documents.length; i += BULK_BATCH_SIZE) {
    const batch = documents.slice(i, i + BULK_BATCH_SIZE);
    const body: Array<Record<string, unknown>> = [];

    for (const doc of batch) {
      body.push({ index: { _index: CIG_ENTITIES_INDEX, _id: doc.id } });
      body.push(doc);
    }

    const response = await client.bulk({ body });

    if (response.body.errors) {
      for (const item of response.body.items) {
        if (item.index?.error) {
          stats.errors++;
        } else {
          stats.indexed++;
        }
      }
    } else {
      stats.indexed += batch.length;
    }

    onProgress?.(stats.indexed, stats.total);
  }

  return stats;
}

/**
 * Index all entities from PostgreSQL into OpenSearch.
 * Uses a query function (dependency injection) to read from the database.
 */
export async function indexAllEntities(
  osClient: Client,
  queryFn: <T>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>,
  onProgress?: (phase: string, count: number) => void,
): Promise<IndexStats> {
  const allDocs: EntityDocument[] = [];

  // 1. Index persons
  const persons = await queryFn<PersonRow>(
    'SELECT id, canonical_name, name_variants, entity_type, party, jurisdictions, employer FROM person',
  );
  for (const row of persons.rows) {
    allDocs.push(buildPersonDocument(row));
  }
  onProgress?.('persons', persons.rows.length);

  // 2. Index committees
  const committees = await queryFn<CommitteeRow>(
    'SELECT id, name, name_variants, committee_type, jurisdiction FROM committee',
  );
  for (const row of committees.rows) {
    allDocs.push(buildCommitteeDocument(row));
  }
  onProgress?.('committees', committees.rows.length);

  // 3. Index organizations
  const orgs = await queryFn<OrganizationRow>(
    `SELECT o.id, o.name, o.name_variants, o.org_type, o.jurisdiction,
            s.name AS sector_name
     FROM organization o
     LEFT JOIN sector s ON o.sector_id = s.id`,
  );
  for (const row of orgs.rows) {
    allDocs.push(buildOrganizationDocument(row));
  }
  onProgress?.('organizations', orgs.rows.length);

  // 4. Bulk index all
  onProgress?.('indexing', allDocs.length);
  return bulkIndexDocuments(osClient, allDocs);
}
