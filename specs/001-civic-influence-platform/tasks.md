# Tasks: Civic Influence Platform

**Input**: Design documents from `/specs/001-civic-influence-platform/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Monorepo initialization, build tooling, and Docker orchestration

- [x] T001 Create monorepo directory structure with npm workspaces: services/{ingest,api,p2p,search}, web/, extension/, packages/{schema,entity-resolution,p2p-protocol}, docker/, tests/{contract,integration,e2e}
- [x] T002 Initialize root package.json with npm workspaces and shared scripts in package.json
- [x] T003 [P] Configure root TypeScript 5.x config and per-package tsconfig extending it in tsconfig.json and packages/*/tsconfig.json
- [x] T004 [P] Configure ESLint and Prettier with shared config in .eslintrc.cjs and .prettierrc
- [x] T005 [P] Create docker-compose.yml with 6 services (postgres, opensearch, api, ingest, p2p, web) and Dockerfiles in docker/docker-compose.yml, docker/Dockerfile.api, docker/Dockerfile.ingest, docker/Dockerfile.p2p, docker/Dockerfile.web
- [x] T006 [P] Create .env.example with all configuration variables (POSTGRES_PASSWORD, FEC_API_KEY, CIG_JURISDICTIONS, CIG_ELECTION_CYCLES, OPENSEARCH_JAVA_OPTS) in .env.example

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, shared type definitions, search index configuration, and API skeleton that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Create PostgreSQL init.sql with all entity tables (person, committee, organization, bill, sector), relationship tables (donation, lobbying_engagement, vote, affiliation), enum types, constraints, and indexes per data-model.md in docker/postgres/init.sql
- [x] T008 Create Apache AGE graph initialization: create graph 'influence', node labels (Person, Committee, Organization, Bill, Sector), edge labels (DONATED_TO, LOBBIED_FOR, LOBBIED_BY, VOTED_ON, SPONSORED, AFFILIATED_WITH, IN_SECTOR, PARENT_OF) in docker/postgres/init-age.sql
- [x] T009 [P] Define shared TypeScript types and Zod validation schemas for all entities and relationships per data-model.md in packages/schema/src/index.ts
- [x] T010 [P] Create OpenSearch index configuration with cig_name_analyzer, cig_phonetic_analyzer, cig_ngram_analyzer, and cig-entities mapping per data-model.md in services/search/src/index-config.ts
- [x] T011 [P] Implement OpenSearch client connection and index bootstrap utility in services/search/src/client.ts
- [x] T012 Implement API server skeleton with Fastify, CORS, request logging, error handling, rate limiting middleware, and provenance metadata envelope per api-rest.md in services/api/src/server.ts and services/api/src/middleware/
- [x] T013 Implement PostgreSQL connection pool with parameterized query helpers in services/api/src/db.ts
- [x] T014 [P] Implement entity resolution matching utilities (fuzzy name matching, source-ID cross-reference, scoring) per research.md in packages/entity-resolution/src/index.ts
- [x] T015 [P] Define P2P encoding conventions: Hyperbee key schemas, changelog event format, Hyperswarm topic derivation per p2p-feeds.md contract in packages/p2p-protocol/src/index.ts

**Checkpoint**: Foundation ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Search and Explore an Entity (Priority: P1) 🎯 MVP

**Goal**: A user can search for a legislator by name, land on a dashboard showing funding, lobbying, and voting data, and drill down to raw records behind any number.

**Independent Test**: Search for a known FEC-sourced legislator and verify the dashboard renders donor breakdowns, sector chart, lobbying ties, and vote summaries with drill-down links to underlying records.

### Data Ingestion (US1)

- [x] T016 [US1] Implement FEC bulk file downloader (committee master, candidate master, individual contributions, committee contributions, operating expenditures) in services/ingest/src/pipelines/fec-download.ts
- [x] T017 [US1] Implement FEC fixed-width and CSV parser with header-file mapping for each bulk file type in services/ingest/src/pipelines/fec-parse.ts
- [x] T018 [US1] Implement entity deduplication pipeline: normalize names, fuzzy match, score candidates, merge with audit log using packages/entity-resolution in services/ingest/src/resolution/deduplicate.ts
- [x] T019 [US1] Implement amendment chain resolver: detect FEC amendment indicators (N/A/T), link filing chains, promote latest canonical filing in services/ingest/src/pipelines/fec-amendments.ts
- [x] T020 [US1] Implement database loader: insert/upsert parsed entities and relationships into PostgreSQL tables and sync AGE graph nodes/edges in services/ingest/src/pipelines/fec-load.ts
- [x] T021 [US1] Implement OpenSearch entity indexer: read entities from PostgreSQL, build cig-entities documents, bulk index via OpenSearch client in services/search/src/indexer.ts
- [x] T022 [US1] Implement ingestion CLI entry point with commands: download, parse, load, index, run --full (5-stage pipeline) in services/ingest/src/cli.ts
- [x] T023 [US1] Implement ingestion validation: schema checks on parsed records, anomaly logging for unexpected values in services/ingest/src/validation/validate.ts

### API Endpoints (US1)

- [x] T024 [P] [US1] Implement search endpoint (GET /search) with OpenSearch fuzzy + phonetic query, type/jurisdiction/sector filters, pagination per api-rest.md in services/api/src/routes/search.ts
- [x] T025 [P] [US1] Implement entity detail endpoint (GET /entities/:id) returning full entity record with source_ids and merge_history in services/api/src/routes/entities.ts
- [x] T026 [US1] Implement dashboard aggregation service: compute funding summary (by sector, top counterparties), lobbying summary (top clients, top issues), voting summary (party alignment, recent votes) in services/api/src/services/dashboard.ts
- [x] T027 [US1] Implement dashboard endpoint (GET /entities/:id/dashboard) with date range filtering per api-rest.md in services/api/src/routes/entities.ts
- [x] T028 [P] [US1] Implement donations list endpoint (GET /entities/:id/donations) with direction, date, amount, sector filters and pagination in services/api/src/routes/entities.ts
- [x] T029 [P] [US1] Implement lobbying list endpoint (GET /entities/:id/lobbying) with pagination in services/api/src/routes/entities.ts
- [x] T030 [P] [US1] Implement votes list endpoint (GET /entities/:id/votes) with pagination in services/api/src/routes/entities.ts

### Web UI (US1)

- [x] T031 [US1] Initialize Next.js 14+ app with app router, global layout, navigation header, and shared styles in web/src/app/layout.tsx and web/src/styles/globals.css
- [x] T032 [US1] Implement search page with autocomplete search input, result list with type/jurisdiction labels, and pagination in web/src/app/search/page.tsx
- [x] T033 [US1] Implement entity dashboard page layout with date range filter and tab sections for funding, lobbying, votes in web/src/app/entities/[id]/page.tsx
- [x] T034 [P] [US1] Create funding summary widget: total received/given, sector breakdown table, top counterparties list in web/src/components/dashboard/FundingSummary.tsx
- [x] T035 [P] [US1] Create lobbying summary widget: engagements count, top clients, top issues in web/src/components/dashboard/LobbySummary.tsx
- [x] T036 [P] [US1] Create voting summary widget: total votes, party alignment ratio, recent votes table in web/src/components/dashboard/VotingSummary.tsx
- [x] T037 [US1] Implement drill-down modal: click any aggregated number → paginated list of individual records with source filing IDs and dates in web/src/components/dashboard/DrillDown.tsx
- [x] T038 [US1] Implement API client library with fetch wrappers, response typing, and error handling in web/src/lib/api-client.ts

**Checkpoint**: User Story 1 complete — search for any entity, view dashboard, drill down to raw records. This is the MVP.

---

## Phase 4: User Story 2 — Filterable Graph and Table Views (Priority: P2)

**Goal**: Users can apply sector, date, amount, and jurisdiction filters to visualize an interactive network graph or browse a sortable table of edges, and export filtered results.

**Independent Test**: Apply sector + date + amount filters and verify graph/table shows only matching edges with correct node labels and edge weights.

- [x] T039 [US2] Implement graph query service: build and execute AGE Cypher queries with filters (sector, date range, amount threshold, edge types, jurisdiction, max_nodes) in services/api/src/services/graph.ts
- [x] T040 [US2] Implement graph query endpoint (POST /graph/query) returning nodes and edges per api-rest.md in services/api/src/routes/graph.ts
- [x] T041 [US2] Implement table view endpoint (GET /graph/table) returning flat edge rows with CSV support per api-rest.md in services/api/src/routes/graph.ts
- [x] T042 [US2] Create Cytoscape.js graph visualization component with node coloring by type, edge weighting by amount, hover tooltips, and zoom/pan in web/src/components/graph/GraphView.tsx
- [x] T043 [US2] Create sortable/filterable table view component with columns for source, target, amount, date, type, filing ID in web/src/components/graph/TableView.tsx
- [x] T044 [US2] Create filter panel component with inputs for sector, date range, amount threshold, jurisdiction, edge type, and apply/reset buttons in web/src/components/graph/FilterPanel.tsx
- [x] T045 [US2] Create graph/table page with view toggle, filter panel integration, and result count in web/src/app/graph/page.tsx
- [x] T046 [P] [US2] Implement CSV and JSON export utility for filtered table results with metadata header (filter params, export date, snapshot version) in web/src/lib/export.ts

**Checkpoint**: User Stories 1 and 2 both independently functional — entity search + dashboards + interactive graph/table exploration.

---

## Phase 5: User Story 3 — In-Browser AI-Assisted Query (Priority: P3)

**Goal**: Users type a natural-language question, the in-browser LLM generates a structured graph query, executes it against cached or live data, and returns a neutral summary with full evidence.

**Independent Test**: Submit an NL question offline (after initial model + data cache), verify a Cypher query is generated and displayed, results returned, and every cited record links to a source filing.

- [x] T047 [US3] Implement WebLLM integration library: model download, Web Worker initialization, cache management, and OpenAI-compatible chat API wrapper in web/src/lib/webllm.ts
- [x] T048 [US3] Create NL-to-Cypher pipeline: system prompt describing graph schema and Cypher syntax, JSON-mode output parsing, query validation in web/src/lib/ai-pipeline.ts
- [x] T049 [US3] Implement result summarization pipeline: feed query results back to WebLLM for neutral narrative generation with constitutional guardrails (no moral judgments, no targeting) in web/src/lib/ai-summarize.ts
- [x] T050 [US3] Create AI chat panel component with input field, streaming response display, and generated query viewer in web/src/components/ai/ChatPanel.tsx
- [x] T051 [US3] Create evidence viewer component: data subsets table, time windows, query parameters, links to source records in web/src/components/ai/EvidenceViewer.tsx
- [x] T052 [US3] Implement client-side audit log: capture NL query, generated Cypher, model version, result count, and persist to localStorage/IndexedDB in web/src/lib/audit-log.ts
- [x] T053 [US3] Implement AI audit log API endpoint (GET /ai/audit-log) for server-side audit persistence per api-rest.md in services/api/src/routes/ai.ts
- [x] T054 [US3] Create AI query page integrating chat panel, evidence viewer, and graph visualization of results in web/src/app/ai/page.tsx
- [x] T055 [US3] Implement offline query execution: IndexedDB data cache population from API, local Cypher-to-SQL translation for cached data in web/src/lib/offline-query.ts

**Checkpoint**: AI-assisted query works in-browser, fully offline after initial cache, with complete evidence and audit trail.

---

## Phase 6: User Story 4 — P2P Data Access and Replication (Priority: P4)

**Goal**: A self-hosted node can export data to P2P feeds, discover peers, serve snapshots, and import data from peers — enabling offline search, dashboards, and AI queries from P2P-bootstrapped data.

**Independent Test**: Export a P2P bundle from a seeding node, import on an isolated node, verify search, dashboards, and AI queries work identically for the data in the bundle.

- [x] T056 [US4] Implement Corestore initialization and named feed management (cig-entities, cig-relationships, cig-changelog, cig-snapshots) per p2p-feeds.md in services/p2p/src/feeds.ts
- [x] T057 [US4] Implement PostgreSQL → Hyperbee entity exporter with key schema entity/{type}/{id}, name index, source index, jurisdiction index, sector index in services/p2p/src/export/entity-exporter.ts
- [x] T058 [US4] Implement PostgreSQL → Hyperbee relationship exporter with key schemas for donations, lobbying, votes, affiliations per p2p-feeds.md in services/p2p/src/export/relationship-exporter.ts
- [x] T059 [US4] Implement Hypercore changelog feed writer: subscribe to PostgreSQL change notifications, write JSON change events to append-only log in services/p2p/src/export/changelog.ts
- [x] T060 [US4] Implement Hyperdrive snapshot exporter: generate JSONL.gz files for all entity/relationship tables plus manifest.json with checksums and record counts in services/p2p/src/export/snapshot.ts
- [x] T061 [US4] Implement Hyperswarm discovery: announce on main CIG topic, per-feed topics, handle peer connections and Noise-encrypted streams in services/p2p/src/sync/discovery.ts
- [x] T062 [US4] Implement sparse replication with jurisdiction, entity-set, and snapshot-only modes using Hyperbee range queries in services/p2p/src/sync/replication.ts
- [x] T063 [US4] Implement P2P import pipeline: download Hyperdrive snapshot or Hyperbee ranges → parse → insert into PostgreSQL/AGE/OpenSearch in services/p2p/src/import/importer.ts
- [x] T064 [US4] Implement live sync: subscribe to remote cig-changelog feed, apply incremental changes to local PostgreSQL/AGE/OpenSearch in services/p2p/src/sync/live-sync.ts
- [x] T065 [US4] Implement P2P CLI entry point with commands: export, follow, seed, status in services/p2p/src/cli.ts
- [x] T066 [US4] Implement replication admin API endpoints (GET /replication/feeds, POST /replication/feeds/:name/seed, POST /replication/feeds/follow) per api-rest.md in services/api/src/routes/replication.ts
- [x] T067 [US4] Create replication admin page showing feed list, peer counts, sync status, and follow/seed controls in web/src/app/admin/replication/page.tsx

**Checkpoint**: Full P2P lifecycle works — a node can export, seed, discover peers, import, and sync incrementally. Offline functionality validated.

---

## Phase 7: User Story 5 — Browser Extension Overlay (Priority: P5)

**Goal**: A browser extension detects entity names on web pages, shows summary overlay cards with top funding/lobbying/voting data, and provides ballot explorer for address-based candidate lookup.

**Independent Test**: Load a page with a known legislator's name, verify the extension renders a summary card within 3 seconds, and every number links back to the CIG dashboard.

- [x] T068 [P] [US5] Create WebExtensions manifest.json (Manifest V3), build configuration (esbuild/webpack), and content security policy in extension/manifest.json and extension/build.config.ts
- [x] T069 [US5] Implement content script for entity name detection: scan page text, match against cached entity list using fuzzy matching in extension/src/content/detector.ts
- [x] T070 [US5] Implement background service worker: fetch entity data from CIG API or P2P cache, maintain IndexedDB entity index, handle content script messages in extension/src/background/worker.ts
- [x] T071 [US5] Create entity summary overlay card component: top funding sectors, major donors, voting-pattern highlights, "Full dashboard" link in extension/src/popup/SummaryCard.tsx
- [x] T072 [US5] Implement ballot races endpoint (GET /ballot/races) with address-based district lookup per api-rest.md in services/api/src/routes/ballot.ts
- [x] T073 [US5] Create ballot explorer component: address input, race list with compact influence cards per candidate in extension/src/ballot/BallotExplorer.tsx
- [x] T074 [US5] Create extension popup UI integrating summary card and ballot explorer tabs in extension/src/popup/Popup.tsx

**Checkpoint**: Extension detects entities on web pages, shows influence summaries, and provides ballot exploration. Links back to full CIG dashboard.

---

## Phase 8: User Story 6 — Bulk Export and Research API (Priority: P6)

**Goal**: Researchers can download versioned bulk snapshots with stable entity IDs, source references, and change logs, and query a documented API with provenance metadata on every record.

**Independent Test**: Download a bulk export, verify every record has a stable internal ID and source-system reference, re-download after ingestion, confirm the change log accurately reflects new/updated/unchanged records.

- [x] T075 [US6] Implement snapshot generation service: query all entities/relationships from PostgreSQL, produce JSONL.gz files with manifest (record counts, checksums, data sources, election cycles) in services/api/src/services/snapshot.ts
- [x] T076 [US6] Implement change log diff generation: compare two snapshots by entity ID, detect new/updated/removed records in services/api/src/services/changelog.ts
- [x] T077 [US6] Implement bulk export endpoints (GET /export/snapshots, GET /export/snapshots/:id/download, GET /export/snapshots/:id/changelog) with API key authentication per api-rest.md in services/api/src/routes/export.ts
- [x] T078 [US6] Implement saved queries CRUD endpoints (POST /saved-queries, GET /saved-queries/:id) with bearer token authentication in services/api/src/routes/saved-queries.ts
- [x] T079 [US6] Implement saved query re-execution endpoint (GET /saved-queries/:id/execute) in services/api/src/routes/saved-queries.ts

**Checkpoint**: Researchers can download versioned snapshots, diff them, save queries, and re-execute against updated data. All records carry provenance.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, performance, security, and validation across all stories

- [x] T080 [P] Create OpenAPI specification documenting all REST endpoints per contracts/api-rest.md in docs/openapi.yml
- [x] T081 [P] Create MAINTAINERS file with machine-readable contributor/governance metadata per Constitution III in MAINTAINERS.md
- [x] T082 Add PostgreSQL performance indexes and table partitioning for donation table by election_cycle in docker/postgres/migrations/001-indexes-partitions.sql
- [x] T083 Security hardening: validate all query parameters via Zod schemas, enforce CSP headers, review rate limiting configuration across all API routes
- [x] T084 Run quickstart.md validation: follow documented steps end-to-end on a clean machine, fix any gaps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — no other story dependencies. **MVP delivery target.**
- **US2 (Phase 4)**: Depends on Foundational (Phase 2). Practically benefits from US1 ingested data but endpoints are independently implementable.
- **US3 (Phase 5)**: Depends on Foundational (Phase 2). Benefits from US1/US2 data and graph UI components. WebLLM integration is independent.
- **US4 (Phase 6)**: Depends on Foundational (Phase 2) + packages/p2p-protocol (T015). Requires data in PostgreSQL (from US1 ingestion) for meaningful export.
- **US5 (Phase 7)**: Depends on Foundational (Phase 2). Requires US1 API endpoints for entity data. Ballot endpoint is self-contained.
- **US6 (Phase 8)**: Depends on Foundational (Phase 2). Requires data in PostgreSQL (from US1 ingestion) for meaningful exports.
- **Polish (Phase 9)**: Depends on all desired user stories being complete

### Within Each User Story

- Models/schemas before services
- Services before endpoints
- Endpoints before UI components
- Ingestion before query (US1: ingest data → serve endpoints → render UI)
- Core implementation before integration
- Story complete before moving to next priority

### Story Completion Order (Recommended)

```
Setup → Foundational → US1 (MVP) → US2 → US3 → US4 → US5 → US6 → Polish
```

### Parallel Opportunities

- **Phase 1**: T003, T004, T005, T006 can all run in parallel after T001+T002
- **Phase 2**: T009, T010, T011, T014, T015 can run in parallel after T007+T008
- **Phase 3 (US1)**: T024, T025 in parallel; T028, T029, T030 in parallel; T034, T035, T036 in parallel
- **Phase 4 (US2)**: T046 parallel with UI implementation
- **Phase 7 (US5)**: T068 parallel with other setup
- **Phase 9**: T080, T081 in parallel
- **Cross-story**: After Foundational, US1–US6 can start in parallel if multiple developers are available (though US1 data is needed by most stories)

---

## Parallel Example: User Story 1

```bash
# After Foundational phase, launch ingestion pipeline sequentially:
T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023

# API endpoints — these can be implemented in parallel (different route files):
T024 "Search endpoint (GET /search) in services/api/src/routes/search.ts"
T025 "Entity detail endpoint (GET /entities/:id) in services/api/src/routes/entities.ts"

# After T026 (dashboard service), these sub-entity endpoints in parallel:
T028 "Donations list endpoint in services/api/src/routes/entities.ts"
T029 "Lobbying list endpoint in services/api/src/routes/entities.ts"
T030 "Votes list endpoint in services/api/src/routes/entities.ts"

# Dashboard widgets — all in parallel (different component files):
T034 "FundingSummary.tsx"
T035 "LobbySummary.tsx"
T036 "VotingSummary.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Search for entity, view dashboard, drill into records
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Validate → Deploy/Demo (**MVP!**)
3. Add US2 → Graph/table exploration → Deploy/Demo
4. Add US3 → AI queries → Deploy/Demo
5. Add US4 → P2P resilience → Deploy/Demo
6. Add US5 → Browser extension → Deploy/Demo
7. Add US6 → Researcher API → Deploy/Demo
8. Polish → Harden, document, optimize

### Parallel Team Strategy

With multiple developers after Foundational:
- Developer A: US1 (ingestion + API endpoints)
- Developer B: US1 (web UI) or US2 (graph/table — shares no files with A)
- Developer C: US3 (WebLLM integration — fully independent client-side)
- After US1 data is available: US4, US5, US6 can proceed in parallel

---

## Notes

- [P] tasks = different files, no dependencies on in-progress tasks
- [US*] label maps task to specific user story for traceability
- Each user story is independently completable and testable after Foundational phase
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All API endpoints follow the response envelope and provenance metadata from contracts/api-rest.md
- All P2P operations follow key schemas and protocols from contracts/p2p-feeds.md
- All entity types and validation rules follow packages/schema definitions from data-model.md
