# Data Model: Civic Influence Platform

**Date**: 2026-03-26
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

---

## Storage Overview

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Canonical relational store | PostgreSQL 16 | Source of truth for all entities, transactions, and metadata |
| Graph layer | Apache AGE (PostgreSQL extension) | Time-aware influence graph: nodes, edges, Cypher queries |
| Search index | OpenSearch 2.x | Fuzzy entity disambiguation, full-text search |
| P2P distribution | Hypercore/Hyperbee/Hyperdrive | Append-only change logs, key-value indices, dataset snapshots |
| Client cache | IndexedDB / Cache API | Offline graph data, WebLLM model weights |
| Annotations overlay | GunDB (optional) | Decentralized user annotations and tags |

---

## Entities

### Person

Individuals: legislators, donors, lobbyists, executives.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| source_ids | JSONB | Array of `{source, external_id}` pairs (e.g., `{source: "fec", external_id: "H8CA52116"}`) |
| canonical_name | TEXT | Normalized display name |
| name_variants | TEXT[] | All observed name forms for dedup matching |
| entity_type | ENUM | `legislator`, `donor`, `lobbyist`, `executive`, `other` |
| party | TEXT | Political party (legislators only), nullable |
| jurisdictions | TEXT[] | States and/or `federal` |
| roles | JSONB | Array of `{role, body, start_date, end_date}` (e.g., `{role: "senator", body: "US Senate", state: "NY"}`) |
| committee_memberships | JSONB | Array of `{committee_id, role, start_date, end_date}` |
| employer | TEXT | Most recent employer (from FEC filings), nullable |
| occupation | TEXT | Most recent occupation, nullable |
| created_at | TIMESTAMPTZ | First ingestion |
| updated_at | TIMESTAMPTZ | Last modification |
| merge_history | JSONB | Array of `{merged_from_id, merged_at, reason}` for audit |

### Committee

Campaign committees, PACs, Super PACs, party committees.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| source_ids | JSONB | E.g., `{source: "fec", external_id: "C00431445"}` |
| name | TEXT | Official registered name |
| name_variants | TEXT[] | Observed name forms |
| committee_type | ENUM | `candidate`, `pac`, `super_pac`, `party`, `joint_fundraising`, `other` |
| designation | TEXT | FEC designation code (A, B, D, J, P, U) |
| jurisdiction | TEXT | State or `federal` |
| treasurer | TEXT | Current treasurer name |
| associated_candidate_id | UUID | FK to Person (nullable; for candidate committees) |
| filing_frequency | TEXT | FEC filing frequency (Q, M, T) |
| active_from | DATE | First filing date |
| active_to | DATE | Termination date, nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Organization

Corporations, nonprofits, trade associations, lobbying firms.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| source_ids | JSONB | External identifiers from registries |
| name | TEXT | Official name |
| name_variants | TEXT[] | Observed name forms |
| org_type | ENUM | `corporation`, `nonprofit`, `trade_association`, `lobbying_firm`, `union`, `other` |
| sector_id | UUID | FK to Sector, nullable |
| industry | TEXT | Specific industry classification |
| parent_org_id | UUID | FK to Organization (self-referential for subsidiaries), nullable |
| jurisdiction | TEXT | State of incorporation or registration |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Bill

Federal or state legislation.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| source_ids | JSONB | E.g., `{source: "congress_gov", external_id: "hr-1234-118"}` |
| title | TEXT | Official title |
| short_title | TEXT | Common short title, nullable |
| bill_number | TEXT | E.g., `H.R.1234` |
| session | TEXT | Congressional session, e.g., `118` |
| chamber | ENUM | `house`, `senate`, `joint` |
| status | TEXT | Current status (introduced, passed_house, passed_senate, enacted, vetoed, etc.) |
| introduced_date | DATE | |
| sponsors | UUID[] | Array of Person IDs |
| committee_referrals | UUID[] | Array of Committee IDs (congressional committees, not campaign committees) |
| subjects | TEXT[] | Subject/topic tags |
| full_text_ref | TEXT | Reference to full text location, nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Sector / Industry

Classification grouping for aggregation and filtering.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| name | TEXT | E.g., `Defense`, `Healthcare`, `Energy` |
| code | TEXT | Standardized code (CRP-style or custom) |
| parent_sector_id | UUID | FK to Sector for hierarchy, nullable |
| description | TEXT | |

---

## Relationships (Graph Edges)

All relationships are modeled as edges in the Apache AGE graph with temporal attributes. They are also stored in relational tables for provenance and bulk export.

### Donation

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| source_entity_id | UUID | FK to Person, Committee, or Organization (donor) |
| source_entity_type | ENUM | `person`, `committee`, `organization` |
| destination_entity_id | UUID | FK to Committee (recipient) |
| amount | NUMERIC(15,2) | Transaction amount in USD |
| transaction_date | DATE | |
| election_cycle | TEXT | 2-year cycle, e.g., `2024` |
| transaction_type | TEXT | Semantic category: `direct_contribution`, `earmark`, `independent_expenditure`, `refund`, `redesignation`, `transfer` |
| fec_transaction_type | TEXT | Raw FEC `TRANSACTION_TP` code |
| is_memo | BOOLEAN | `true` if `MEMO_CD = 'X'` (do not double-count) |
| filing_id | TEXT | Source filing number |
| amendment_chain | JSONB | Array of `{filing_id, amendment_indicator, date}` if amended |
| source_system | TEXT | `fec`, state abbreviation, etc. |
| source_record_id | TEXT | Original system record ID (`SUB_ID` for FEC) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Lobbying Engagement

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| registrant_org_id | UUID | FK to Organization (lobbying firm) |
| client_org_id | UUID | FK to Organization (client) |
| lobbyist_person_ids | UUID[] | Array of FK to Person |
| issues | TEXT[] | General issue area codes |
| specific_issues | TEXT | Free-text description of specific lobbying issues |
| covered_agencies | TEXT[] | Government agencies lobbied |
| covered_bill_ids | UUID[] | FKs to Bill, nullable |
| income | NUMERIC(15,2) | Reported lobbying income, nullable |
| expenses | NUMERIC(15,2) | Reported lobbying expenses, nullable |
| period_start | DATE | Filing period start |
| period_end | DATE | Filing period end |
| filing_id | TEXT | Source filing identifier |
| source_system | TEXT | `lda` (Lobbying Disclosure Act), state abbreviation |
| source_record_id | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Vote

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| person_id | UUID | FK to Person (legislator) |
| bill_id | UUID | FK to Bill |
| vote_cast | ENUM | `yea`, `nay`, `present`, `not_voting` |
| vote_date | DATE | |
| roll_call_number | TEXT | Chamber roll-call number |
| session | TEXT | Congressional session |
| chamber | ENUM | `house`, `senate` |
| source_system | TEXT | E.g., `congress_gov`, `propublica` |
| source_record_id | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### Affiliation

General-purpose relationship for organizational affiliations.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Stable internal identifier |
| source_entity_id | UUID | |
| source_entity_type | ENUM | `person`, `committee`, `organization` |
| target_entity_id | UUID | |
| target_entity_type | ENUM | `person`, `committee`, `organization` |
| affiliation_type | ENUM | `employment`, `board_member`, `subsidiary`, `joint_fundraising`, `leadership_pac`, `other` |
| start_date | DATE | Nullable |
| end_date | DATE | Nullable |
| source_system | TEXT | |
| source_record_id | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

## Graph Model (Apache AGE)

The AGE graph named `influence` mirrors the relational entities and relationships as labeled property graph nodes and edges.

### Node Labels

| Label | Maps To | Key Properties |
|-------|---------|---------------|
| `Person` | Person table | `id`, `canonical_name`, `entity_type`, `party`, `jurisdictions` |
| `Committee` | Committee table | `id`, `name`, `committee_type`, `jurisdiction` |
| `Organization` | Organization table | `id`, `name`, `org_type`, `sector_id`, `industry` |
| `Bill` | Bill table | `id`, `title`, `bill_number`, `session`, `chamber`, `status` |
| `Sector` | Sector table | `id`, `name`, `code` |

### Edge Labels

| Label | From → To | Key Properties |
|-------|-----------|---------------|
| `DONATED_TO` | Person/Committee/Org → Committee | `amount`, `transaction_date`, `election_cycle`, `transaction_type`, `filing_id` |
| `LOBBIED_FOR` | Organization → Organization | `income`, `period_start`, `period_end`, `issues`, `filing_id` |
| `LOBBIED_BY` | Person → Organization | `period_start`, `period_end` (lobbyist-to-registrant) |
| `VOTED_ON` | Person → Bill | `vote_cast`, `vote_date`, `roll_call_number` |
| `SPONSORED` | Person → Bill | `introduced_date` |
| `AFFILIATED_WITH` | any → any | `affiliation_type`, `start_date`, `end_date` |
| `IN_SECTOR` | Organization → Sector | |
| `PARENT_OF` | Organization → Organization | subsidiary relationship |

### Example Cypher Queries

**Neighborhood: "Who donates to this legislator's committee?"**
```cypher
SELECT * FROM cypher('influence', $$
  MATCH (d)-[don:DONATED_TO]->(c:Committee)-[:AFFILIATED_WITH]->(p:Person {id: $person_id})
  WHERE don.transaction_date >= $start AND don.transaction_date <= $end
    AND don.is_memo = false
  RETURN d.canonical_name AS donor, d.entity_type AS type,
         SUM(don.amount) AS total, COUNT(don) AS count
  ORDER BY total DESC LIMIT 20
$$) AS (donor agtype, type agtype, total agtype, count agtype);
```

**Time-filtered subgraph: "Defense sector donations > $50k in last 2 years"**
```cypher
SELECT * FROM cypher('influence', $$
  MATCH (d)-[don:DONATED_TO]->(c:Committee)-[:AFFILIATED_WITH]->(p:Person)
  WHERE d.sector_id = $defense_sector_id
    AND don.transaction_date >= $start AND don.transaction_date <= $end
    AND don.amount >= 50000
    AND don.is_memo = false
  RETURN d, don, c, p
$$) AS (d agtype, don agtype, c agtype, p agtype);
```

---

## Validation Rules

| Entity | Rule | Enforcement |
|--------|------|-------------|
| Donation | `amount` must be non-null, non-negative | DB constraint + ingestion validation |
| Donation | `is_memo = true` records excluded from aggregation totals | Application logic in dashboard queries |
| Donation | Amendment chain must reference valid filing IDs | Referential check in ingestion pipeline |
| Person | `canonical_name` must be non-empty | DB constraint |
| Person | `merge_history` updated on every dedup merge | Ingestion pipeline |
| Committee | `active_to` must be >= `active_from` when both set | DB constraint |
| Vote | `vote_cast` must be one of the enum values | DB enum type |
| Lobbying Engagement | `period_end` >= `period_start` | DB constraint |
| All entities | `source_ids` must contain at least one entry | Ingestion validation |
| All entities | `id` (UUID) immutable after creation | Application policy |

---

## State Transitions

### Entity Resolution States

```
CANDIDATE → MERGED → (may be SPLIT)
```

| State | Description |
|-------|-------------|
| `CANDIDATE` | Potential match identified by fuzzy search; awaiting scoring |
| `MERGED` | Two or more source records merged under one canonical entity; `merge_history` updated |
| `SPLIT` | Previously merged entity separated due to dedup logic correction; old ID → new IDs mapping recorded in migration notes |

Merge and split decisions are logged in `merge_history` (Person, Committee, Organization) and in a separate `entity_resolution_log` table for global audit.

### Filing Amendment States

```
NEW → AMENDED → TERMINATED (optional)
```

| Indicator | FEC Code | Meaning |
|-----------|----------|---------|
| New | `N` | Original filing |
| Amendment | `A` | Supersedes previous filing for the same period |
| Termination | `T` | Committee/filing terminated |

The latest non-terminated filing in an amendment chain is canonical. All versions retained for audit.

---

## P2P Data Encoding

Entities and relationships are encoded for P2P distribution via Hypercore/Hyperbee/Hyperdrive:

| Structure | Use | Key Format | Value Format |
|-----------|-----|-----------|-------------|
| Hypercore (append-only log) | Change feed per dataset | Sequence number | JSON: `{op: "upsert"/"delete", table, id, data, timestamp}` |
| Hyperbee (B-tree index) | Entity lookup by ID | `entity/{type}/{id}` | Compressed JSON of entity record |
| Hyperbee (B-tree index) | Entity lookup by name prefix | `name/{normalized_name}/{id}` | `{id, type, canonical_name}` |
| Hyperbee (B-tree index) | Donations by recipient + date | `donations/{recipient_id}/{YYYYMMDD}/{id}` | Compressed JSON of donation record |
| Hyperdrive (file system) | Bulk snapshots | `/snapshots/{cycle}/{table}.jsonl.gz` | gzipped JSON Lines |
| Hyperdrive (file system) | Metadata | `/metadata.json` | Schema version, export date, data coverage, record counts |

Hyperswarm topic keys derived from: `sha256("cig/" + dataset_name + "/" + version_prefix)`, truncated to 32 bytes.

---

## OpenSearch Index Mapping

Entity disambiguation index: `cig-entities`

```json
{
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "entity_type": { "type": "keyword" },
      "canonical_name": {
        "type": "text",
        "analyzer": "cig_name_analyzer",
        "fields": {
          "phonetic": { "type": "text", "analyzer": "cig_phonetic_analyzer" },
          "ngram": { "type": "text", "analyzer": "cig_ngram_analyzer" },
          "keyword": { "type": "keyword" }
        }
      },
      "name_variants": {
        "type": "text",
        "analyzer": "cig_name_analyzer",
        "fields": {
          "phonetic": { "type": "text", "analyzer": "cig_phonetic_analyzer" }
        }
      },
      "jurisdiction": { "type": "keyword" },
      "sector": { "type": "keyword" },
      "party": { "type": "keyword" },
      "employer": { "type": "text", "analyzer": "standard" },
      "committee_name": {
        "type": "text",
        "analyzer": "cig_name_analyzer"
      }
    }
  }
}
```

Custom analyzers:
- `cig_name_analyzer`: `lowercase` → `asciifolding` → `synonym` (nickname mappings: Rob→Robert, Bill→William, etc.)
- `cig_phonetic_analyzer`: `lowercase` → `asciifolding` → `double_metaphone`
- `cig_ngram_analyzer`: `lowercase` → `asciifolding` → `edge_ngram` (min=2, max=15)
