# P2P Feed Contract: Civic Influence Platform

**Date**: 2026-03-26
**Version**: 0.1.0-draft
**Protocol Stack**: Hypercore 10 / Hyperbee 2 / Hyperdrive 11 / Hyperswarm 4

---

## Overview

CIG uses the Pear P2P stack for peer-to-peer data replication. Each node publishes its data as a set of Hypercore append-only logs indexed by Hyperbee. Snapshots are distributed via Hyperdrive. Discovery happens over Hyperswarm using deterministic topic hashes.

All P2P data is **read-only at the source** (append-only logs signed by the originator). Peers replicate sparsely — they can request specific key ranges without downloading the full dataset.

---

## Feed Architecture

### Feeds per Node

Each CIG node manages the following named cores via a single Corestore:

| Feed Name | Type | Description |
|-----------|------|-------------|
| `cig-entities` | Hyperbee | Entity records (persons, committees, organizations, bills, sectors) |
| `cig-relationships` | Hyperbee | Relationship records (donations, lobbying, votes, affiliations) |
| `cig-changelog` | Hypercore | Ordered change log (append-only) for audit/replay |
| `cig-snapshots` | Hyperdrive | Periodic full snapshots (JSONL files) |

### Corestore Namespace

All feeds share a single Corestore rooted at `{data_dir}/corestore/`. Feed names are derived deterministically:

```
corestore.get({ name: 'cig-entities' })
corestore.get({ name: 'cig-relationships' })
corestore.get({ name: 'cig-changelog' })
```

---

## Hyperbee Key Schemas

### Entity Bee (`cig-entities`)

Key format uses `/` as separator. All keys are UTF-8 encoded strings.

| Key Pattern | Value | Description |
|-------------|-------|-------------|
| `entity/{type}/{id}` | JSON entity record | Primary entity lookup |
| `name/{normalized_name}/{id}` | `{ entity_type, canonical_name }` | Name index for search |
| `source/{source_system}/{external_id}` | `{ entity_id, entity_type }` | Source ID cross-reference |
| `jurisdiction/{jurisdiction}/{entity_type}/{id}` | `{ canonical_name }` | Jurisdiction index |
| `sector/{sector_id}/{entity_type}/{id}` | `{ canonical_name }` | Sector index |

**Entity record value**:
```json
{
  "id": "uuid",
  "entity_type": "person",
  "canonical_name": "Jane Smith",
  "name_variants": ["SMITH, JANE A."],
  "source_ids": [{"source": "fec", "external_id": "H8CA52116"}],
  "party": "D",
  "jurisdictions": ["federal", "CA"],
  "sector_id": null,
  "created_at": "2026-03-15T00:00:00Z",
  "updated_at": "2026-03-25T12:00:00Z",
  "version": 3
}
```

### Relationship Bee (`cig-relationships`)

| Key Pattern | Value | Description |
|-------------|-------|-------------|
| `donation/{recipient_id}/{date}/{id}` | JSON donation record | Donations by recipient + date |
| `donation-source/{donor_id}/{date}/{id}` | `{ donation_id, recipient_id, amount }` | Reverse index: donations by donor |
| `lobbying/{target_id}/{date}/{id}` | JSON lobbying record | Lobbying by target + date |
| `vote/{voter_id}/{date}/{bill_id}` | JSON vote record | Votes by legislator + date |
| `affiliation/{entity_id}/{org_id}` | JSON affiliation record | Entity-organization links |

**Donation record value**:
```json
{
  "id": "uuid",
  "source_entity_id": "uuid",
  "destination_entity_id": "uuid",
  "amount": 2800.00,
  "transaction_date": "2025-10-15",
  "transaction_type": "direct_contribution",
  "fec_transaction_type": "15",
  "election_cycle": "2026",
  "filing_id": "FEC-12345678",
  "source_system": "fec",
  "source_record_id": "4123456789",
  "is_memo": false,
  "amendment_chain": [],
  "amendment_status": "NEW",
  "created_at": "2026-03-15T00:00:00Z"
}
```

### Changelog Core (`cig-changelog`)

Each entry in the append-only Hypercore log is a JSON-encoded change event:

```json
{
  "seq": 1500000,
  "timestamp": "2026-03-25T18:30:00Z",
  "operation": "upsert",
  "feed": "cig-entities",
  "key": "entity/person/uuid",
  "entity_type": "person",
  "entity_id": "uuid",
  "version": 3,
  "source": "fec-ingest",
  "batch_id": "uuid"
}
```

Operations: `upsert`, `delete`, `merge` (entity resolution), `split` (entity un-merge).

---

## Hyperdrive Snapshot Layout

Periodic snapshots are published as a Hyperdrive. Directory structure:

```
/
├── manifest.json
├── entities/
│   ├── persons.jsonl.gz
│   ├── committees.jsonl.gz
│   ├── organizations.jsonl.gz
│   ├── bills.jsonl.gz
│   └── sectors.jsonl.gz
├── relationships/
│   ├── donations.jsonl.gz
│   ├── lobbying.jsonl.gz
│   ├── votes.jsonl.gz
│   └── affiliations.jsonl.gz
└── changelog/
    └── changes-since-{prev_snapshot_seq}.jsonl.gz
```

**manifest.json**:
```json
{
  "version": "1.0.0",
  "created_at": "2026-03-15T00:00:00Z",
  "node_public_key": "hex-64-chars",
  "record_counts": {
    "persons": 1500000,
    "committees": 25000,
    "organizations": 80000,
    "bills": 35000,
    "sectors": 400,
    "donations": 85000000,
    "lobbying": 520000,
    "votes": 1200000,
    "affiliations": 350000
  },
  "data_sources": ["fec", "lda", "ca", "tx", "ny", "fl", "il"],
  "election_cycles": ["2020", "2022", "2024", "2026"],
  "prev_snapshot_seq": 1200000,
  "current_seq": 1500000,
  "checksum_sha256": "hex-64-chars"
}
```

---

## Hyperswarm Topic Derivation

Topics for peer discovery are derived deterministically so that peers advertising the same dataset find each other:

```javascript
import crypto from 'hypercore-crypto'

// Main discovery topic — all CIG nodes announce here
const CIG_NAMESPACE = Buffer.from('civic-influence-graph-v1')
const mainTopic = crypto.discoveryKey(CIG_NAMESPACE)

// Per-feed topics (for selective replication)
function feedTopic(feedPublicKey) {
  return crypto.discoveryKey(feedPublicKey)
}
```

All nodes **MUST** announce on the main topic. Per-feed topics are announced only while actively seeding that feed.

---

## Replication Protocol

### Bootstrap Flow

1. New node joins the Hyperswarm main topic.
2. Discovers peers; requests feed public keys via initial handshake.
3. Opens Hyperdrive snapshot from a trusted peer (or configured seed).
4. Downloads latest snapshot (sparse — can skip historical JSONL files).
5. Applies snapshot to local PostgreSQL + AGE + OpenSearch.
6. Subscribes to `cig-changelog` Hypercore for live updates.
7. Processes change events to keep local stores in sync.

### Live Sync

After bootstrap, nodes stay connected to changelog feeds:

1. On new changelog entry → read the referenced key from the entity/relationship Hyperbee.
2. Apply the change to local PostgreSQL.
3. Update AGE graph edges/nodes.
4. Update OpenSearch index.
5. Confirm processing by updating local cursor (stored in local Hyperbee).

### Sparse Replication

Peers are not required to replicate the full dataset. Supported sparse modes:

| Mode | Description |
|------|-------------|
| `full` | Replicate all feeds completely |
| `jurisdiction` | Replicate only entities and relationships matching specified jurisdictions |
| `entity-set` | Replicate only a specific set of entity IDs and their direct relationships |
| `snapshot-only` | Download latest snapshot; no live sync |

Sparse replication uses Hyperbee range queries to fetch only matching key prefixes.

---

## Feed Versioning

Feed format changes follow semantic versioning in the manifest:

- **Patch**: New optional fields in records.
- **Minor**: New key patterns or new JSONL files in snapshots.
- **Major**: Breaking changes to key schema or record format.

Peers **MUST** reject feeds with incompatible major versions. Peers **SHOULD** warn on minor version mismatches.

---

## Trust & Verification

- Each feed is signed by its Hypercore keypair — data integrity is guaranteed by the protocol.
- **Community reputation** (per spec): Peers maintain a local trust score per feed based on data quality metrics (entity resolution accuracy, filing coverage, uptime).
- No centralized authority. Trust is accumulated through consistent, verifiable data publishing.
- Peers can cross-reference data from multiple feeds to detect anomalies.
- Feed public keys are shared out-of-band or via social proof (website, git repo, keybase).

---

## Wire Format

All Hyperbee values and Hypercore entries are JSON-encoded UTF-8 strings. Large snapshots use gzip compression (`.jsonl.gz`). No custom binary encoding — maximizes interoperability and debuggability (Constitution III, VIII).
