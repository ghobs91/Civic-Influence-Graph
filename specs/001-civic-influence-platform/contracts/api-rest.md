# API Contract: Civic Influence Platform

**Date**: 2026-03-26
**Version**: 0.1.0-draft
**Base URL**: `https://{host}/api/v1`

---

## Overview

RESTful JSON API with optional GraphQL endpoint. All responses include provenance metadata. No identity-based targeting filters are exposed (Constitution I). Authentication is required only for write operations (saved queries) and bulk exports (rate limiting).

## Common Response Envelope

All responses follow this structure:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "uuid",
    "timestamp": "ISO-8601",
    "data_snapshot": "2026-03-15T00:00:00Z",
    "query_params": { ... },
    "total_count": 1234,
    "page": 1,
    "page_size": 50
  }
}
```

Error responses:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Entity not found",
    "request_id": "uuid"
  }
}
```

## Authentication

- **Read operations**: No authentication required.
- **Write operations** (saved queries, annotations): Bearer token (JWT or API key).
- **Bulk export**: API key required for rate limiting.
- **Rate limiting**: Unauthenticated: 100 req/min. Authenticated: 1000 req/min. Bulk export: 10 req/hour.

---

## Endpoints

### Search

#### `GET /search`

Full-text entity search with disambiguation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | yes | Search query (name, partial name) |
| `type` | string | no | Filter by entity type: `person`, `committee`, `organization`, `bill` |
| `jurisdiction` | string | no | Filter by jurisdiction: state abbreviation or `federal` |
| `sector` | string | no | Filter by sector code |
| `page` | integer | no | Page number (default: 1) |
| `page_size` | integer | no | Results per page (default: 20, max: 100) |

**Response** `200 OK`:
```json
{
  "data": {
    "results": [
      {
        "id": "uuid",
        "entity_type": "person",
        "canonical_name": "Jane Smith",
        "name_variants": ["SMITH, JANE A.", "Jane A. Smith"],
        "jurisdiction": "federal",
        "party": "D",
        "roles": [{"role": "representative", "body": "US House", "state": "CA"}],
        "relevance_score": 0.95
      }
    ]
  },
  "meta": { ... }
}
```

---

### Entities

#### `GET /entities/{id}`

Retrieve a single entity by stable internal ID.

**Response** `200 OK`:
```json
{
  "data": {
    "id": "uuid",
    "entity_type": "person",
    "canonical_name": "Jane Smith",
    "source_ids": [{"source": "fec", "external_id": "H8CA52116"}],
    "name_variants": ["SMITH, JANE A."],
    "party": "D",
    "jurisdictions": ["federal", "CA"],
    "roles": [...],
    "committee_memberships": [...],
    "merge_history": [...]
  },
  "meta": { ... }
}
```

#### `GET /entities/{id}/dashboard`

Pre-aggregated dashboard data for an entity.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | date | no | Filter start (ISO-8601 date) |
| `end_date` | date | no | Filter end (ISO-8601 date) |

**Response** `200 OK`:
```json
{
  "data": {
    "entity": { "id": "uuid", "canonical_name": "Jane Smith", "entity_type": "person" },
    "funding_summary": {
      "total_received": 1500000.00,
      "total_given": 0.00,
      "by_sector": [
        {"sector": "Defense", "sector_id": "uuid", "amount": 450000.00, "count": 120}
      ],
      "top_counterparties": [
        {"entity_id": "uuid", "name": "ACME PAC", "entity_type": "committee", "amount": 50000.00, "count": 3}
      ]
    },
    "lobbying_summary": {
      "engagements_mentioning": 15,
      "top_clients": [
        {"org_id": "uuid", "name": "BigCorp Inc.", "engagement_count": 5}
      ],
      "top_issues": ["Defense", "Appropriations"]
    },
    "voting_summary": {
      "total_votes": 342,
      "by_party_alignment": {"with_party": 310, "against_party": 32},
      "recent_votes": [
        {"bill_id": "uuid", "bill_number": "H.R.1234", "vote_cast": "yea", "vote_date": "2026-02-15"}
      ]
    }
  },
  "meta": { ... }
}
```

#### `GET /entities/{id}/donations`

Paginated list of individual donation records for an entity (as donor or recipient).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `direction` | string | no | `inbound`, `outbound`, or `both` (default: `both`) |
| `start_date` | date | no | Filter start |
| `end_date` | date | no | Filter end |
| `min_amount` | number | no | Minimum donation amount |
| `sector` | string | no | Filter by donor/recipient sector |
| `page` | integer | no | |
| `page_size` | integer | no | Max: 500 |

**Response** `200 OK`:
```json
{
  "data": {
    "donations": [
      {
        "id": "uuid",
        "source_entity": {"id": "uuid", "name": "John Doe", "type": "person"},
        "destination_entity": {"id": "uuid", "name": "Smith For Congress", "type": "committee"},
        "amount": 2800.00,
        "transaction_date": "2025-10-15",
        "transaction_type": "direct_contribution",
        "election_cycle": "2026",
        "filing_id": "FEC-12345678",
        "source_system": "fec",
        "source_record_id": "4123456789"
      }
    ]
  },
  "meta": { ... }
}
```

#### `GET /entities/{id}/lobbying`

Lobbying engagements involving the entity.

#### `GET /entities/{id}/votes`

Roll-call votes for a legislator entity.

---

### Graph

#### `POST /graph/query`

Execute a filtered graph query. Returns nodes and edges for visualization.

**Request body**:
```json
{
  "center_entity_id": "uuid",
  "depth": 2,
  "filters": {
    "start_date": "2024-01-01",
    "end_date": "2026-01-01",
    "sectors": ["Defense"],
    "min_amount": 50000,
    "edge_types": ["DONATED_TO", "LOBBIED_FOR"],
    "jurisdictions": ["federal"]
  },
  "max_nodes": 200
}
```

**Response** `200 OK`:
```json
{
  "data": {
    "nodes": [
      {"id": "uuid", "label": "Person", "name": "Jane Smith", "properties": {...}}
    ],
    "edges": [
      {"id": "uuid", "source": "uuid", "target": "uuid", "label": "DONATED_TO", "properties": {"amount": 50000, "transaction_date": "2025-06-01", "filing_id": "FEC-123"}}
    ]
  },
  "meta": { ... }
}
```

#### `GET /graph/table`

Same filtering as `/graph/query` but returns a flat table of edges for export.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `center_entity_id` | uuid | no | Center the query on this entity |
| `start_date` | date | no | |
| `end_date` | date | no | |
| `sectors` | string | no | Comma-separated sector codes |
| `min_amount` | number | no | |
| `edge_types` | string | no | Comma-separated edge types |
| `format` | string | no | `json` (default) or `csv` |
| `page` | integer | no | |
| `page_size` | integer | no | Max: 1000 |

---

### AI Query Audit

#### `GET /ai/audit-log`

Retrieve audit logs for AI-assisted queries (FR-016).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `start_date` | datetime | no | Filter start |
| `end_date` | datetime | no | Filter end |
| `page` | integer | no | |

**Response** `200 OK`:
```json
{
  "data": {
    "entries": [
      {
        "id": "uuid",
        "timestamp": "ISO-8601",
        "natural_language_query": "Which industries...",
        "generated_query": "MATCH (d)-[don:DONATED_TO]->...",
        "query_params": {"start": "2025-01-01", "end": "2025-12-31", "person_id": "uuid"},
        "model_id": "phi-3-mini-q4f16",
        "model_version": "0.2.82",
        "result_count": 15,
        "client_info": {"user_agent": "...", "session_id": "uuid"}
      }
    ]
  },
  "meta": { ... }
}
```

---

### Saved Queries

#### `POST /saved-queries`

Save a query configuration (requires authentication).

#### `GET /saved-queries/{id}`

Retrieve a saved query by ID or content hash.

#### `GET /saved-queries/{id}/execute`

Re-execute a saved query against current data.

---

### Bulk Export

#### `GET /export/snapshots`

List available bulk export snapshots.

**Response** `200 OK`:
```json
{
  "data": {
    "snapshots": [
      {
        "id": "uuid",
        "created_at": "2026-03-15T00:00:00Z",
        "election_cycles": ["2024", "2026"],
        "data_sources": ["fec", "lda", "ca", "tx"],
        "record_counts": {"persons": 1500000, "committees": 25000, "donations": 85000000},
        "format": "jsonl.gz",
        "size_bytes": 4200000000,
        "download_url": "/export/snapshots/uuid/download",
        "change_log_url": "/export/snapshots/uuid/changelog"
      }
    ]
  }
}
```

#### `GET /export/snapshots/{id}/download`

Download a bulk snapshot (API key required).

#### `GET /export/snapshots/{id}/changelog`

Download the change log between this snapshot and the previous one.

---

### Replication (Admin)

#### `GET /replication/feeds`

List P2P feeds this node manages.

**Response** `200 OK`:
```json
{
  "data": {
    "feeds": [
      {
        "name": "cig-entities",
        "public_key": "hex-encoded-32-bytes",
        "topic": "hex-encoded-32-bytes",
        "length": 1500000,
        "seeding": true,
        "peers": 5,
        "bytes_uploaded": 4200000000,
        "last_sync": "2026-03-25T18:00:00Z"
      }
    ]
  }
}
```

#### `POST /replication/feeds/{name}/seed`

Start or stop seeding a feed.

#### `POST /replication/feeds/follow`

Follow a remote feed by public key.

---

### Ballot Explorer

#### `GET /ballot/races`

Retrieve races for an address.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `address` | string | yes | Street address for district lookup |
| `state` | string | no | State abbreviation |

**Response** `200 OK`:
```json
{
  "data": {
    "races": [
      {
        "office": "US House - CA-12",
        "candidates": [
          {
            "entity_id": "uuid",
            "name": "Jane Smith",
            "party": "D",
            "incumbent": true,
            "summary": {
              "total_raised": 1500000,
              "top_sectors": ["Defense", "Healthcare"],
              "top_donors": [{"name": "ACME PAC", "amount": 50000}]
            }
          }
        ]
      }
    ]
  },
  "meta": { ... }
}
```

---

## Versioning

API versions via URL path prefix (`/api/v1/`). Breaking changes require a new major version. Non-breaking additions (new fields, new endpoints) do not require version bumps.

## Content Types

- Request: `application/json`
- Response: `application/json` (default), `text/csv` (for export with `format=csv`)

## Pagination

Cursor-based pagination is preferred for large result sets. Offset-based pagination (`page`, `page_size`) is also supported. Responses include `meta.total_count`, `meta.page`, and `meta.page_size`.
