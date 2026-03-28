/**
 * Sparse replication (T062).
 * Supports jurisdiction, entity-set, and snapshot-only modes using
 * Hyperbee range queries.
 */

import type Hyperbee from 'hyperbee';
import { keyRange, type ReplicationConfig } from '@cig/p2p-protocol';

export interface ReplicationResult {
  mode: string;
  entitiesReplicated: number;
  relationshipsReplicated: number;
}

/**
 * Replicate a subset of data from a remote Hyperbee based on the replication config.
 */
export async function replicateEntities(
  remoteBee: Hyperbee,
  localBee: Hyperbee,
  config: ReplicationConfig,
): Promise<ReplicationResult> {
  const result: ReplicationResult = {
    mode: config.mode,
    entitiesReplicated: 0,
    relationshipsReplicated: 0,
  };

  switch (config.mode) {
    case 'full':
      result.entitiesReplicated = await replicateRange(remoteBee, localBee, 'entity/');
      break;

    case 'jurisdiction':
      if (config.jurisdictions) {
        for (const jur of config.jurisdictions) {
          const count = await replicateRange(remoteBee, localBee, `jurisdiction/${jur}/`);
          result.entitiesReplicated += count;
          // Also replicate the actual entity records referenced by jurisdiction index
          await replicateJurisdictionEntities(remoteBee, localBee, jur);
        }
      }
      break;

    case 'entity-set':
      if (config.entityIds) {
        for (const entityId of config.entityIds) {
          const found = await replicateByEntityId(remoteBee, localBee, entityId);
          if (found) result.entitiesReplicated++;
        }
      }
      break;

    case 'snapshot-only':
      // Snapshot-only mode doesn't use Hyperbee — handled by snapshot importer
      break;
  }

  return result;
}

/**
 * Replicate all relationships from remote to local Hyperbee.
 */
export async function replicateRelationships(
  remoteBee: Hyperbee,
  localBee: Hyperbee,
  config: ReplicationConfig,
): Promise<number> {
  if (config.mode === 'snapshot-only') return 0;

  let count = 0;
  const prefixes = ['donation/', 'donation-source/', 'lobbying/', 'vote/', 'affiliation/'];

  if (config.mode === 'full') {
    for (const prefix of prefixes) {
      count += await replicateRange(remoteBee, localBee, prefix);
    }
  } else if (config.mode === 'entity-set' && config.entityIds) {
    // For entity-set mode, replicate relationships involving those entities
    for (const entityId of config.entityIds) {
      for (const prefix of ['donation/', 'donation-source/', 'lobbying/', 'vote/', 'affiliation/']) {
        count += await replicateRange(remoteBee, localBee, `${prefix}${entityId}/`);
      }
    }
  }

  return count;
}

/**
 * Replicate all keys under a given prefix from remote to local.
 */
async function replicateRange(
  remoteBee: Hyperbee,
  localBee: Hyperbee,
  prefix: string,
): Promise<number> {
  const range = keyRange(prefix);
  let count = 0;

  const stream = remoteBee.createReadStream(range);
  for await (const entry of stream) {
    await localBee.put(entry.key, entry.value);
    count++;
  }

  return count;
}

/**
 * After replicating jurisdiction indexes, also fetch the actual entity records.
 */
async function replicateJurisdictionEntities(
  remoteBee: Hyperbee,
  localBee: Hyperbee,
  jurisdiction: string,
): Promise<void> {
  const range = keyRange(`jurisdiction/${jurisdiction}`);
  const stream = remoteBee.createReadStream(range);

  for await (const entry of stream) {
    // Key is jurisdiction/{jur}/{type}/{id} — extract type and id
    const parts = (entry.key as string).split('/');
    if (parts.length >= 4) {
      const entityType = parts[2];
      const entityId = parts[3];
      const entityKey = `entity/${entityType}/${entityId}`;
      const entityEntry = await remoteBee.get(entityKey);
      if (entityEntry) {
        await localBee.put(entityKey, entityEntry.value);
      }
    }
  }
}

/**
 * Replicate a single entity by scanning entity/* for matching ID.
 */
async function replicateByEntityId(
  remoteBee: Hyperbee,
  localBee: Hyperbee,
  entityId: string,
): Promise<boolean> {
  // Scan all entity types for this ID
  const types = ['person', 'committee', 'organization', 'bill', 'sector'];
  for (const type of types) {
    const key = `entity/${type}/${entityId}`;
    const entry = await remoteBee.get(key);
    if (entry) {
      await localBee.put(key, entry.value);
      return true;
    }
  }
  return false;
}
