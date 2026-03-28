# Implementation Plan: Civic Influence Platform

**Branch**: `001-civic-influence-platform` | **Date**: 2026-03-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-civic-influence-platform/spec.md`

## Summary

Build an open, self-hostable, P2P-capable web platform that unifies U.S. campaign finance (FEC + 5 initial states), lobbying disclosures, corporate structures, and legislative behavior into a time-aware influence graph. Provides entity search, dashboards, interactive graph/table views, in-browser AI-assisted queries (WebLLM), a browser extension with entity overlays, and resilient P2P data distribution via the Pear/Hypercore stack. All AI inference runs client-side; all services run via docker-compose on commodity hardware.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 20 LTS) for backend services, ingestion, and P2P; TypeScript/React for frontend and browser extension
**Primary Dependencies**: Next.js 14+, FastAPI or tRPC (API layer), WebLLM (client-side AI), Cytoscape.js (graph viz), OpenSearch 2.x (search), Pear P2P modules (hypercore, hyperbee, hyperdrive, hyperswarm, hyperdht, corestore, localdrive, mirror-drive), GunDB (optional collaborative overlay)
**Storage**: PostgreSQL 16 (canonical relational store), OpenSearch (full-text indexing), IndexedDB/localStorage (client cache)
**Testing**: Vitest (unit + integration), Playwright (E2E), contract tests for API and P2P data formats
**Target Platform**: Linux server (Docker), modern browsers (WebGPU/WASM)
**Project Type**: Web application with backend services, browser extension, and P2P sidecar
**Performance Goals**: p95 search/dashboard queries < 2 s; AI answer < 10 s; browser extension overlay < 3 s
**Constraints**: Offline-capable after initial cache; no proprietary managed service dependencies; all AI client-side only
**Scale/Scope**: Tens of millions of entities, hundreds of millions of edges; initial focus on federal data + 5 states

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence / Notes |
|---|-----------|--------|------------------|
| I | Identity-Neutral Analysis | PASS | FR-018 requires behavioral/structural signals only. No demographic filters in API or UI design. |
| II | Evidence and Provenance First | PASS | FR-007 requires drill-down to raw records. FR-016 logs AI query provenance. All dashboards link to source filings. |
| III | Transparency of the Tool Itself | PASS | Governance decisions versioned in-repo. Plan calls for machine-readable MAINTAINERS file in the graph. |
| IV | Open Data and Open Source by Default | PASS | All backend logic, schemas, pipelines open source. FR-015 provides documented APIs and bulk export. FR-013 provides P2P bundles. |
| V | Privacy and Safety | PASS | FR-019 requires redaction of private addresses, prohibits de-anonymization. No third-party personal data enrichment. |
| VI | Explainable, Client-Side AI | PASS | FR-009 requires browser-only LLM via WebLLM. FR-016 logs all query parameters. AI outputs always show underlying queries and data subsets. |
| VII | Local-First and P2P-Resilient | PASS | FR-017 requires full offline operation from P2P data. FR-013/014 use Hypercore/Hyperbee/Hyperdrive/Hyperswarm. GunDB for optional overlays. |
| VIII | Self-Hostability | PASS | docker-compose deployment; no proprietary dependencies. SC-009 targets < 1 hour install. |
| IX | Simplicity Over Cleverness | PASS | Graph queries on PostgreSQL (with Apache AGE extension) rather than separate graph DB — fewer moving parts. Single language (TypeScript). Justified services: postgres, opensearch, p2p sidecar. |
| X | Test-First for Critical Paths | PASS | Contract tests for ingestion, entity resolution, graph construction, P2P export/import. Vitest + Playwright. |
| XI | Auditability and Reproducibility | PASS | FR-015 provides versioned snapshots with change logs. FR-016 logs AI query reconstruction inputs. Migration notes required for schema changes. |
| XII | Constitutional Evolution | N/A | Governance process; not a design gate for this feature. |

**Gate result: PASS — no violations. Proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/001-civic-influence-platform/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── api-rest.md
│   └── p2p-feeds.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
services/
├── ingest/              # Ingestion & ETL workers (TypeScript/Node)
│   ├── src/
│   │   ├── pipelines/   # Per-source pipeline configs and transforms
│   │   ├── resolution/  # Entity deduplication and resolution
│   │   └── validation/  # Schema checks, anomaly logging
│   └── tests/
├── api/                 # API gateway & query orchestrator (TypeScript/Node)
│   ├── src/
│   │   ├── routes/      # REST/GraphQL endpoints
│   │   ├── services/    # Query orchestration, provenance logging
│   │   └── middleware/  # Auth, rate-limiting, constitutional filters
│   └── tests/
├── p2p/                 # P2P replication sidecar (TypeScript/Node + Pear modules)
│   ├── src/
│   │   ├── export/      # PostgreSQL → Hypercore/Hyperbee/Hyperdrive export
│   │   ├── import/      # P2P bundle → PostgreSQL import
│   │   ├── sync/        # Hyperswarm discovery, incremental replication
│   │   └── admin/       # Replication status, feed management
│   └── tests/
└── search/              # OpenSearch index management (TypeScript/Node)
    ├── src/
    └── tests/

web/                     # Web application (Next.js + React)
├── src/
│   ├── app/             # Next.js app router pages
│   ├── components/      # Reusable UI components
│   │   ├── dashboard/   # Entity dashboard widgets
│   │   ├── graph/       # Cytoscape.js graph visualization
│   │   └── ai/         # WebLLM chat panel, evidence viewer
│   ├── lib/             # Client-side data fetching, caching, WebLLM integration
│   └── styles/
└── tests/

extension/               # Browser extension (WebExtensions + TypeScript)
├── src/
│   ├── content/         # Content scripts for entity detection
│   ├── popup/           # Extension popup UI
│   ├── background/      # Service worker, data fetching, caching
│   └── ballot/          # Ballot explorer components
└── tests/

packages/                # Shared libraries (TypeScript)
├── schema/              # Canonical entity types, validation schemas
├── entity-resolution/   # Shared dedup/matching logic
└── p2p-protocol/        # Shared Hypercore/Hyperbee encoding and topic conventions

docker/
├── docker-compose.yml   # Full-stack orchestration
├── Dockerfile.api
├── Dockerfile.ingest
├── Dockerfile.p2p
├── Dockerfile.web
└── postgres/
    └── init.sql         # Schema initialization

tests/
├── contract/            # Cross-service contract tests
├── integration/         # End-to-end integration tests
└── e2e/                 # Playwright browser tests
```

**Structure Decision**: Multi-service web application architecture with a shared `packages/` layer. Each service is independently deployable but composed via docker-compose for self-hosting. The browser extension is a separate build target. Graph functionality uses PostgreSQL + Apache AGE extension (graph queries in SQL) rather than a separate graph database, keeping the service count to: postgres, opensearch, api, ingest, p2p, web. This satisfies Constitution IX (simplicity) while supporting the scale requirements.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 6 services in docker-compose | Each serves a distinct, independently scalable concern (data ingestion, API, P2P, search, web, database) | Monolith would couple ingestion schedules to API availability and make P2P sidecar lifecycle management difficult |
| OpenSearch as separate service | Full-text fuzzy search and disambiguation across tens of millions of entities exceeds PostgreSQL full-text capabilities at target scale | PostgreSQL `tsvector` tested; insufficient for fuzzy multi-field entity disambiguation at scale |

## Post-Design Constitution Re-Check

*Re-evaluation after Phase 1 design artifacts (data-model.md, contracts/, quickstart.md) are complete.*

| # | Principle | Status | Post-Design Evidence |
|---|-----------|--------|----------------------|
| I | Identity-Neutral Analysis | PASS | API contract explicitly prohibits identity-based filters. Data model contains no demographic fields. Search/graph endpoints filter by behavioral signals only (amounts, dates, sectors, jurisdictions). |
| II | Evidence and Provenance First | PASS | Every API response includes `meta.data_snapshot` and `meta.query_params`. Entity records carry `source_ids` and `merge_history`. P2P changelog provides full audit trail. |
| III | Transparency of the Tool Itself | PASS | All contracts are documented and versioned. P2P feed architecture is fully specified. Wire format is JSON (human-readable). |
| IV | Open Data and Open Source by Default | PASS | Bulk export endpoint defined (`/export/snapshots`). P2P Hyperdrive snapshots with manifest provide open data bundles. All formats documented. |
| V | Privacy and Safety | PASS | No private address fields in data model. Entity records contain only publicly-disclosed information from official filings. No PII enrichment endpoints. |
| VI | Explainable, Client-Side AI | PASS | AI audit log endpoint (`/ai/audit-log`) captures NL query → generated query → model version → result count. All AI runs in-browser (no server-side LLM endpoints in API contract). |
| VII | Local-First and P2P-Resilient | PASS | P2P feed contract defines full bootstrap-from-peer flow. Sparse replication modes (jurisdiction, entity-set) enable selective sync. Snapshot-only mode for minimal footprint. |
| VIII | Self-Hostability | PASS | Quickstart documents complete docker-compose setup in 5 steps. `.env` configuration with sensible defaults. No external service dependencies beyond FEC API key for ingestion. |
| IX | Simplicity Over Cleverness | PASS | JSON wire format everywhere (no custom binary encoding). Single language (TypeScript). AGE extension in PostgreSQL avoids separate graph DB. Complexity tracking justifies the 2 deviations. |
| X | Test-First for Critical Paths | PASS | Contract test directory in project structure. API contract provides testable response schemas. P2P contract provides verifiable key schemas and manifest format. |
| XI | Auditability and Reproducibility | PASS | Hyperdrive snapshots include `checksum_sha256` and `prev_snapshot_seq` for chain verification. Changelog core records every mutation with batch IDs. Export snapshots include versioned change logs. |
| XII | Constitutional Evolution | N/A | Governance process; not a design gate. |

**Post-design gate result: PASS — no new violations introduced by Phase 1 design artifacts.**
