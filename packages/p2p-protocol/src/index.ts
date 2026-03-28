/**
 * P2P protocol definitions: Hyperbee key schemas, changelog event format,
 * Hyperswarm topic derivation per p2p-feeds.md contract.
 */

import { z } from 'zod';
import crypto from 'node:crypto';

// ============================================================
// FEED NAMES
// ============================================================

export const FEED_NAMES = {
  ENTITIES: 'cig-entities',
  RELATIONSHIPS: 'cig-relationships',
  CHANGELOG: 'cig-changelog',
  SNAPSHOTS: 'cig-snapshots',
} as const;

export type FeedName = (typeof FEED_NAMES)[keyof typeof FEED_NAMES];

// ============================================================
// HYPERBEE KEY SCHEMAS
// ============================================================

/**
 * Entity Bee key builders.
 * All keys use '/' as separator, UTF-8 encoded.
 */
export const entityKeys = {
  /** Primary entity lookup: entity/{type}/{id} */
  entity(type: string, id: string): string {
    return `entity/${type}/${id}`;
  },
  /** Name index: name/{normalized_name}/{id} */
  name(normalizedName: string, id: string): string {
    return `name/${normalizedName}/${id}`;
  },
  /** Source ID cross-reference: source/{source_system}/{external_id} */
  source(sourceSystem: string, externalId: string): string {
    return `source/${sourceSystem}/${externalId}`;
  },
  /** Jurisdiction index: jurisdiction/{jurisdiction}/{entity_type}/{id} */
  jurisdiction(jurisdiction: string, entityType: string, id: string): string {
    return `jurisdiction/${jurisdiction}/${entityType}/${id}`;
  },
  /** Sector index: sector/{sector_id}/{entity_type}/{id} */
  sector(sectorId: string, entityType: string, id: string): string {
    return `sector/${sectorId}/${entityType}/${id}`;
  },
} as const;

/**
 * Relationship Bee key builders.
 */
export const relationshipKeys = {
  /** Donations by recipient + date: donation/{recipient_id}/{YYYYMMDD}/{id} */
  donation(recipientId: string, date: string, id: string): string {
    return `donation/${recipientId}/${date.replace(/-/g, '')}/${id}`;
  },
  /** Reverse donation index: donation-source/{donor_id}/{YYYYMMDD}/{id} */
  donationSource(donorId: string, date: string, id: string): string {
    return `donation-source/${donorId}/${date.replace(/-/g, '')}/${id}`;
  },
  /** Lobbying by target + date: lobbying/{target_id}/{YYYYMMDD}/{id} */
  lobbying(targetId: string, date: string, id: string): string {
    return `lobbying/${targetId}/${date.replace(/-/g, '')}/${id}`;
  },
  /** Votes by legislator + date: vote/{voter_id}/{YYYYMMDD}/{bill_id} */
  vote(voterId: string, date: string, billId: string): string {
    return `vote/${voterId}/${date.replace(/-/g, '')}/${billId}`;
  },
  /** Affiliation: affiliation/{entity_id}/{org_id} */
  affiliation(entityId: string, orgId: string): string {
    return `affiliation/${entityId}/${orgId}`;
  },
} as const;

// ============================================================
// HYPERBEE KEY PREFIX UTILITIES
// ============================================================

/**
 * Get the range keys for a Hyperbee sub-query on a prefix.
 * Useful for iterating all records under a key prefix.
 */
export function keyRange(prefix: string): { gte: string; lt: string } {
  // Append '/' to ensure we match the full prefix, then use '\xff' as upper bound
  const gte = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const lt = `${gte}\xff`;
  return { gte, lt };
}

// ============================================================
// CHANGELOG EVENT FORMAT
// ============================================================

export const ChangelogOperationEnum = z.enum(['upsert', 'delete', 'merge', 'split']);
export type ChangelogOperation = z.infer<typeof ChangelogOperationEnum>;

export const ChangelogEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  timestamp: z.string(),
  operation: ChangelogOperationEnum,
  feed: z.string(),
  key: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  version: z.number().int().positive(),
  source: z.string(),
  batch_id: z.string().uuid(),
});
export type ChangelogEvent = z.infer<typeof ChangelogEventSchema>;

/**
 * Create a changelog event.
 */
export function createChangelogEvent(
  opts: Omit<ChangelogEvent, 'timestamp'>
): ChangelogEvent {
  return {
    ...opts,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================
// SNAPSHOT MANIFEST
// ============================================================

export const SnapshotManifestSchema = z.object({
  version: z.string(),
  created_at: z.string(),
  node_public_key: z.string(),
  record_counts: z.record(z.number().int().nonnegative()),
  data_sources: z.array(z.string()),
  election_cycles: z.array(z.string()),
  prev_snapshot_seq: z.number().int().nonnegative(),
  current_seq: z.number().int().nonnegative(),
  checksum_sha256: z.string(),
});
export type SnapshotManifest = z.infer<typeof SnapshotManifestSchema>;

// ============================================================
// HYPERSWARM TOPIC DERIVATION
// ============================================================

const CIG_NAMESPACE = Buffer.from('civic-influence-graph-v1');

/**
 * Derive the main CIG discovery topic.
 * All CIG nodes MUST announce on this topic.
 */
export function mainDiscoveryTopic(): Buffer {
  return crypto.createHash('sha256').update(CIG_NAMESPACE).digest().subarray(0, 32);
}

/**
 * Derive a per-feed discovery topic from a feed's public key.
 * Announced only while actively seeding that feed.
 */
export function feedDiscoveryTopic(feedPublicKey: Buffer): Buffer {
  return crypto.createHash('sha256').update(feedPublicKey).digest().subarray(0, 32);
}

// ============================================================
// SNAPSHOT FILE PATHS
// ============================================================

export const snapshotPaths = {
  manifest: '/manifest.json',
  entities: {
    persons: '/entities/persons.jsonl.gz',
    committees: '/entities/committees.jsonl.gz',
    organizations: '/entities/organizations.jsonl.gz',
    bills: '/entities/bills.jsonl.gz',
    sectors: '/entities/sectors.jsonl.gz',
  },
  relationships: {
    donations: '/relationships/donations.jsonl.gz',
    lobbying: '/relationships/lobbying.jsonl.gz',
    votes: '/relationships/votes.jsonl.gz',
    affiliations: '/relationships/affiliations.jsonl.gz',
  },
  changelogSince(prevSeq: number): string {
    return `/changelog/changes-since-${prevSeq}.jsonl.gz`;
  },
} as const;

// ============================================================
// REPLICATION MODES
// ============================================================

export const ReplicationModeEnum = z.enum(['full', 'jurisdiction', 'entity-set', 'snapshot-only']);
export type ReplicationMode = z.infer<typeof ReplicationModeEnum>;

export interface ReplicationConfig {
  mode: ReplicationMode;
  /** For 'jurisdiction' mode: list of jurisdiction codes to replicate */
  jurisdictions?: string[];
  /** For 'entity-set' mode: list of entity IDs to replicate */
  entityIds?: string[];
}
