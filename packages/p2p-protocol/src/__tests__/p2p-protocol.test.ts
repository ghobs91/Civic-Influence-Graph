import { describe, it, expect } from 'vitest';
import {
  FEED_NAMES,
  entityKeys,
  relationshipKeys,
  keyRange,
  ChangelogEventSchema,
  SnapshotManifestSchema,
  mainDiscoveryTopic,
  feedDiscoveryTopic,
  snapshotPaths,
  createChangelogEvent,
  ReplicationModeEnum,
} from '../index.js';

describe('Feed Names', () => {
  it('has all four feed names', () => {
    expect(FEED_NAMES.ENTITIES).toBe('cig-entities');
    expect(FEED_NAMES.RELATIONSHIPS).toBe('cig-relationships');
    expect(FEED_NAMES.CHANGELOG).toBe('cig-changelog');
    expect(FEED_NAMES.SNAPSHOTS).toBe('cig-snapshots');
  });
});

describe('Entity Keys', () => {
  it('builds entity key', () => {
    expect(entityKeys.entity('person', 'uuid-1')).toBe('entity/person/uuid-1');
  });

  it('builds name index key', () => {
    expect(entityKeys.name('jane smith', 'uuid-1')).toBe('name/jane smith/uuid-1');
  });

  it('builds source key', () => {
    expect(entityKeys.source('fec', 'H8CA52116')).toBe('source/fec/H8CA52116');
  });

  it('builds jurisdiction key', () => {
    expect(entityKeys.jurisdiction('CA', 'person', 'uuid-1')).toBe(
      'jurisdiction/CA/person/uuid-1'
    );
  });

  it('builds sector key', () => {
    expect(entityKeys.sector('sector-1', 'organization', 'uuid-1')).toBe(
      'sector/sector-1/organization/uuid-1'
    );
  });
});

describe('Relationship Keys', () => {
  it('builds donation key with date formatting', () => {
    expect(relationshipKeys.donation('rcpt-1', '2025-10-15', 'don-1')).toBe(
      'donation/rcpt-1/20251015/don-1'
    );
  });

  it('builds donation source reverse index', () => {
    expect(relationshipKeys.donationSource('donor-1', '2025-10-15', 'don-1')).toBe(
      'donation-source/donor-1/20251015/don-1'
    );
  });

  it('builds vote key', () => {
    expect(relationshipKeys.vote('voter-1', '2025-06-15', 'bill-1')).toBe(
      'vote/voter-1/20250615/bill-1'
    );
  });

  it('builds affiliation key', () => {
    expect(relationshipKeys.affiliation('entity-1', 'org-1')).toBe(
      'affiliation/entity-1/org-1'
    );
  });
});

describe('keyRange', () => {
  it('generates correct range for prefix', () => {
    const range = keyRange('entity/person');
    expect(range.gte).toBe('entity/person/');
    expect(range.lt).toBe('entity/person/\xff');
  });

  it('handles prefix ending with /', () => {
    const range = keyRange('entity/person/');
    expect(range.gte).toBe('entity/person/');
    expect(range.lt).toBe('entity/person/\xff');
  });
});

describe('Changelog Event', () => {
  it('validates a valid changelog event', () => {
    const event = {
      seq: 1500000,
      timestamp: '2026-03-25T18:30:00Z',
      operation: 'upsert' as const,
      feed: 'cig-entities',
      key: 'entity/person/uuid-1',
      entity_type: 'person',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
      version: 3,
      source: 'fec-ingest',
      batch_id: '550e8400-e29b-41d4-a716-446655440099',
    };
    const result = ChangelogEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('rejects invalid operation', () => {
    const event = {
      seq: 1,
      timestamp: '2026-03-25T18:30:00Z',
      operation: 'invalid',
      feed: 'cig-entities',
      key: 'entity/person/uuid-1',
      entity_type: 'person',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
      version: 1,
      source: 'test',
      batch_id: '550e8400-e29b-41d4-a716-446655440099',
    };
    const result = ChangelogEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });

  it('creates a changelog event with timestamp', () => {
    const event = createChangelogEvent({
      seq: 1,
      operation: 'upsert',
      feed: 'cig-entities',
      key: 'entity/person/test-id',
      entity_type: 'person',
      entity_id: '550e8400-e29b-41d4-a716-446655440000',
      version: 1,
      source: 'test',
      batch_id: '550e8400-e29b-41d4-a716-446655440099',
    });
    expect(event.timestamp).toBeTruthy();
    expect(ChangelogEventSchema.safeParse(event).success).toBe(true);
  });
});

describe('Snapshot Manifest', () => {
  it('validates a valid manifest', () => {
    const manifest = {
      version: '1.0.0',
      created_at: '2026-03-15T00:00:00Z',
      node_public_key: 'abcdef1234567890',
      record_counts: { persons: 1500000, committees: 25000 },
      data_sources: ['fec', 'lda'],
      election_cycles: ['2024', '2026'],
      prev_snapshot_seq: 1200000,
      current_seq: 1500000,
      checksum_sha256: 'aabbccdd',
    };
    const result = SnapshotManifestSchema.safeParse(manifest);
    expect(result.success).toBe(true);
  });
});

describe('Topic Derivation', () => {
  it('produces a 32-byte main discovery topic', () => {
    const topic = mainDiscoveryTopic();
    expect(topic).toBeInstanceOf(Buffer);
    expect(topic.length).toBe(32);
  });

  it('produces consistent main topic', () => {
    expect(mainDiscoveryTopic()).toEqual(mainDiscoveryTopic());
  });

  it('produces a 32-byte feed topic', () => {
    const pubKey = Buffer.alloc(32, 0x01);
    const topic = feedDiscoveryTopic(pubKey);
    expect(topic).toBeInstanceOf(Buffer);
    expect(topic.length).toBe(32);
  });

  it('produces different topics for different keys', () => {
    const key1 = Buffer.alloc(32, 0x01);
    const key2 = Buffer.alloc(32, 0x02);
    expect(feedDiscoveryTopic(key1)).not.toEqual(feedDiscoveryTopic(key2));
  });
});

describe('Snapshot Paths', () => {
  it('has correct manifest path', () => {
    expect(snapshotPaths.manifest).toBe('/manifest.json');
  });

  it('generates changelog path', () => {
    expect(snapshotPaths.changelogSince(1200000)).toBe(
      '/changelog/changes-since-1200000.jsonl.gz'
    );
  });
});

describe('Replication Mode', () => {
  it('validates valid modes', () => {
    expect(ReplicationModeEnum.safeParse('full').success).toBe(true);
    expect(ReplicationModeEnum.safeParse('jurisdiction').success).toBe(true);
    expect(ReplicationModeEnum.safeParse('entity-set').success).toBe(true);
    expect(ReplicationModeEnum.safeParse('snapshot-only').success).toBe(true);
  });

  it('rejects invalid mode', () => {
    expect(ReplicationModeEnum.safeParse('invalid').success).toBe(false);
  });
});
