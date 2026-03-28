/**
 * PostgreSQL → Hyperbee entity exporter (T057).
 * Reads entities from PostgreSQL and writes them to the cig-entities Hyperbee
 * with primary, name, source, jurisdiction, and sector indexes.
 */

import type pg from 'pg';
import type Hyperbee from 'hyperbee';
import { entityKeys } from '@cig/p2p-protocol';

export interface ExportStats {
  entitiesExported: number;
  indexEntriesWritten: number;
}

interface EntityRow {
  id: string;
  entity_type: string;
  canonical_name: string;
  name_variants: string[] | null;
  source_ids: Array<{ source: string; external_id: string }> | null;
  party: string | null;
  jurisdictions: string[] | null;
  sector_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

const ENTITY_TABLES: Record<string, string> = {
  person: 'person',
  committee: 'committee',
  organization: 'organization',
  bill: 'bill',
  sector: 'sector',
};

/**
 * Export all entities from PostgreSQL to a Hyperbee.
 * Writes primary entity key + name, source, jurisdiction, and sector indexes.
 */
export async function exportEntities(
  pool: pg.Pool,
  bee: Hyperbee,
  onProgress?: (count: number) => void,
): Promise<ExportStats> {
  let entitiesExported = 0;
  let indexEntriesWritten = 0;

  for (const [entityType, table] of Object.entries(ENTITY_TABLES)) {
    const query = buildEntityQuery(table, entityType);
    const result = await pool.query<EntityRow>(query);

    for (const row of result.rows) {
      const record = buildEntityRecord(row, entityType);

      // Primary key: entity/{type}/{id}
      const primaryKey = entityKeys.entity(entityType, row.id);
      await bee.put(primaryKey, record);
      entitiesExported++;

      // Name index: name/{normalized_name}/{id}
      const normalizedName = normalizeName(row.canonical_name);
      if (normalizedName) {
        const nameKey = entityKeys.name(normalizedName, row.id);
        await bee.put(nameKey, { entity_type: entityType, canonical_name: row.canonical_name });
        indexEntriesWritten++;
      }

      // Source indexes: source/{source_system}/{external_id}
      if (row.source_ids) {
        for (const src of row.source_ids) {
          const sourceKey = entityKeys.source(src.source, src.external_id);
          await bee.put(sourceKey, { entity_id: row.id, entity_type: entityType });
          indexEntriesWritten++;
        }
      }

      // Jurisdiction indexes
      if (row.jurisdictions) {
        for (const jur of row.jurisdictions) {
          const jurKey = entityKeys.jurisdiction(jur, entityType, row.id);
          await bee.put(jurKey, { canonical_name: row.canonical_name });
          indexEntriesWritten++;
        }
      }

      // Sector index
      if (row.sector_id) {
        const sectorKey = entityKeys.sector(row.sector_id, entityType, row.id);
        await bee.put(sectorKey, { canonical_name: row.canonical_name });
        indexEntriesWritten++;
      }

      if (entitiesExported % 1000 === 0) {
        onProgress?.(entitiesExported);
      }
    }
  }

  return { entitiesExported, indexEntriesWritten };
}

function buildEntityQuery(table: string, entityType: string): string {
  // Each table has different columns — normalize to a common shape
  switch (entityType) {
    case 'person':
      return `SELECT id, 'person' as entity_type, canonical_name, name_variants,
              source_ids, party, jurisdictions, NULL as sector_id,
              created_at, updated_at, version FROM person`;
    case 'committee':
      return `SELECT id, 'committee' as entity_type, name as canonical_name, NULL as name_variants,
              source_ids, party_affiliation as party, jurisdictions, NULL as sector_id,
              created_at, updated_at, version FROM committee`;
    case 'organization':
      return `SELECT id, 'organization' as entity_type, name as canonical_name, NULL as name_variants,
              source_ids, NULL as party, jurisdictions, sector_id,
              created_at, updated_at, version FROM organization`;
    case 'bill':
      return `SELECT id, 'bill' as entity_type, title as canonical_name, NULL as name_variants,
              source_ids, NULL as party, jurisdictions, NULL as sector_id,
              created_at, updated_at, version FROM bill`;
    case 'sector':
      return `SELECT id, 'sector' as entity_type, name as canonical_name, NULL as name_variants,
              NULL as source_ids, NULL as party, NULL as jurisdictions, NULL as sector_id,
              created_at, updated_at, 1 as version FROM sector`;
    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

function buildEntityRecord(row: EntityRow, entityType: string): Record<string, unknown> {
  return {
    id: row.id,
    entity_type: entityType,
    canonical_name: row.canonical_name,
    name_variants: row.name_variants ?? [],
    source_ids: row.source_ids ?? [],
    party: row.party,
    jurisdictions: row.jurisdictions ?? [],
    sector_id: row.sector_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

/**
 * Normalize a name for indexing: lowercase, strip diacritics, collapse whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
