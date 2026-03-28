# Feature Specification: Civic Influence Platform

**Feature Branch**: `001-civic-influence-platform`
**Created**: 2026-03-26
**Status**: Draft
**Input**: User description: "Build Civic Influence Graph (CIG), an open, self-hostable, P2P-capable, AI-assisted web platform that unifies campaign finance, lobbying disclosures, corporate structures, and legislative behavior into a live influence graph for U.S. politics."

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Search and Explore an Entity (Priority: P1)

An investigative journalist hears a tip about a particular legislator's fundraising. They open CIG, type the legislator's name, disambiguate from a short list, and land on a dashboard showing who funds that person, which sectors dominate, which lobbyists are registered, and how the legislator voted on bills tied to those sectors. From that dashboard they click into the raw records behind any number.

**Why this priority**: Entity search and dashboard are the foundational interaction; every other feature (AI queries, browser extension, P2P sharing) depends on being able to find and display entity data. Delivering this alone already provides meaningful value.

**Independent Test**: Can be fully tested by searching for a known FEC-sourced legislator and verifying that the dashboard renders donor breakdowns, sector pie chart, lobbying ties, and vote summaries with drill-down links to underlying records.

**Acceptance Scenarios**:

1. **Given** at least one election cycle of FEC data has been ingested, **When** the user searches for a legislator by full or partial name, **Then** the system returns a ranked list of matching entities with type labels (person, committee, org) within 2 seconds.
2. **Given** a user has selected a legislator from search results, **When** the dashboard loads, **Then** it shows: inbound funding totals by sector, top 10 donor counterparties, lobbying registrations mentioning the legislator, and roll-call vote records — each section linking to the raw underlying records.
3. **Given** a dashboard is displayed, **When** the user adjusts the date-range filter, **Then** all dashboard sections update to reflect only the selected time window.
4. **Given** a dashboard is displayed, **When** the user clicks any aggregated number, **Then** they see the individual transactions or records that compose it, with source identifiers and filing dates.

---

### User Story 2 — Filterable Graph and Table Views (Priority: P2)

A watchdog NGO analyst monitoring defense-sector influence selects the "Defense" sector, a two-year window, and a $50 000 minimum threshold. The system renders an interactive network view showing donors, PACs, committees, and legislators connected by donation and lobbying edges that meet those criteria. The analyst toggles between graph and table views, drills into clusters, and exports a filtered table for a report.

**Why this priority**: Graph and table views turn the data model into an analytical tool. Without them, dashboards are isolated; with them, users can discover emergent patterns across entities.

**Independent Test**: Can be tested by applying sector + date + amount filters and verifying that the resulting graph/table contains only edges meeting all filter criteria, with correct node labels and edge weights.

**Acceptance Scenarios**:

1. **Given** ingested data and the graph view open, **When** the user sets sector = "Defense", date range = last 2 years, and minimum amount = $50 000, **Then** only edges matching all three criteria are displayed; nodes with no qualifying edges are hidden.
2. **Given** a filtered graph view, **When** the user switches to table view, **Then** a sortable table of the same filtered edges is displayed with columns for source, target, amount, date, type, and source filing ID.
3. **Given** a table view, **When** the user clicks "Export", **Then** the system downloads a CSV or JSON file containing exactly the displayed rows plus a metadata header (filter parameters, export date, data snapshot version).

---

### User Story 3 — In-Browser AI-Assisted Query (Priority: P3)

A citizen types: "Which industries increased donations to Senator X in the 6 months before vote Y?" The in-browser LLM translates the question into a structured graph query, executes it locally against cached data, and returns a clear, neutral summary with a table of results. Below the summary, the system shows the exact structured query used, the time window applied, and links to every underlying record.

**Why this priority**: AI-assisted query is the main differentiator for non-expert users and directly implements the CIG constitution's requirement for explainable, client-side AI. It builds on the entity data and graph from P1/P2.

**Independent Test**: Can be tested by submitting a natural-language question offline (network disabled after initial model and data cache are present) and verifying that a structured query is shown, results are returned, and every cited record links to a viewable source filing.

**Acceptance Scenarios**:

1. **Given** the user has loaded a browser-local LLM and has cached graph data, **When** they submit a natural-language question, **Then** the system displays the structured query it generated, a neutral narrative summary, and a results table — all within 10 seconds.
2. **Given** an AI-generated answer is displayed, **When** the user clicks "Show evidence", **Then** they see the exact data subsets, time windows, and query parameters used.
3. **Given** the user's network connection is disabled (after initial model and data cache), **When** they submit a question, **Then** the system still produces an answer from locally cached data without any remote call.
4. **Given** any AI-generated answer, **Then** it contains no moral judgments, no prescriptive voting recommendations, and no language that singles out entities by protected characteristics.

---

### User Story 4 — P2P Data Access and Replication (Priority: P4)

A small-town newsroom with unreliable internet sets up a self-hosted CIG node. They import a P2P data bundle covering the latest two election cycles. Once imported, they can search, browse dashboards, and run AI queries entirely offline. Periodically, when the connection is available, their node syncs incremental updates from peers without re-downloading the full dataset.

**Why this priority**: P2P replication is a core resilience pillar of the constitution. It can be delivered after the primary UI features are working and validated against centrally served data.

**Independent Test**: Can be tested by exporting a P2P bundle from a seeding node, importing it on an isolated node, and verifying that search, dashboards, and AI queries work identically to the online version for the data contained in the bundle.

**Acceptance Scenarios**:

1. **Given** a seeding CIG node with ingested data, **When** an operator triggers a P2P bundle export, **Then** the system produces a distributable bundle that a second node can discover and replicate via peer-to-peer protocols without any central coordination server.
2. **Given** a node bootstrapped from a P2P bundle, **When** a user searches and browses, **Then** all UI features (search, dashboards, filters) work identically to a node with direct upstream API access, for the data contained in the bundle.
3. **Given** an existing P2P-bootstrapped node that later regains network connectivity, **When** incremental updates are available from peers, **Then** the node downloads only the changed segments (sparse replication) without a full re-sync.
4. **Given** a node operator, **When** they view the "Replication" admin section, **Then** they see which P2P datasets they are seeding and following, along with sync status and peer count.

---

### User Story 5 — Browser Extension Overlay (Priority: P5)

A voter visits a news article mentioning a congressional candidate. The CIG browser extension detects the candidate's name, matches it against the influence graph, and shows a small overlay card with: top funding sectors, largest donors, and a voting-record summary. The card links back to the full CIG dashboard. If the user visits a ballot-lookup page and enters their address, the extension shows compact "influence cards" for every candidate in their races.

**Why this priority**: The extension meets users where they are (browsing the web, researching ballots) instead of requiring them to visit CIG directly. It depends on stable entity data, aggregates, and optionally P2P-cached data.

**Independent Test**: Can be tested by loading a page containing a known legislator's name, verifying the extension renders a summary card within 3 seconds, and confirming every number in the card links back to the CIG dashboard with matching data.

**Acceptance Scenarios**:

1. **Given** the browser extension is installed and the user visits a page mentioning a recognized entity, **When** the page loads, **Then** the extension displays a summary card with top funding sectors, largest donors, and voting-pattern highlights within 3 seconds.
2. **Given** a displayed summary card, **When** the user clicks "Full dashboard", **Then** they are taken to the entity's CIG dashboard.
3. **Given** a ballot-explorer mode, **When** the user enters their address, **Then** the extension displays compact influence cards for each candidate in their races, sourced from precomputed aggregates or cached P2P data.

---

### User Story 6 — Bulk Export and Research API (Priority: P6)

An academic researcher needs a stable, versioned dataset for a peer-reviewed study. They access the bulk export endpoint, download a complete snapshot with entity identifiers, change logs, and provenance metadata. They can also query a documented REST/GraphQL API for more targeted extracts. Every record carries a stable internal ID and a reference to its originating source identifier.

**Why this priority**: Supports the reproducibility and auditability constitutional principles. Deferred because it serves a smaller (but important) power-user audience and builds on the same underlying data as the UI features.

**Independent Test**: Can be tested by downloading a bulk export, verifying every record includes a stable internal ID and source-system reference, then re-downloading after an ingestion cycle and confirming the change log accurately reflects new, updated, and unchanged records.

**Acceptance Scenarios**:

1. **Given** an authenticated or rate-limited API request, **When** a researcher requests a bulk export, **Then** the system produces a downloadable snapshot containing entities, relationships, and transactions with stable internal IDs, source-system identifiers, and a change log.
2. **Given** a documented REST or GraphQL API, **When** a researcher queries for entities matching specific filters, **Then** results include provenance metadata (source, filing date, ingestion timestamp) for every record.
3. **Given** two successive bulk exports, **When** a researcher compares them, **Then** a change log accurately identifies new, updated, and removed records between snapshots.

---

### Edge Cases

- What happens when a search query matches hundreds of similarly named entities across multiple jurisdictions? The system must present disambiguation options grouped by type and jurisdiction, limiting initial results but allowing progressive loading.
- How does the system handle a data source (e.g., FEC bulk files) that publishes a retroactive correction or amendment to previously ingested records? The system must detect the amendment, update the affected graph edges, and record the correction in the change log.
- What happens when the in-browser LLM generates a structured query that returns zero results? The system must display the query used, explain "no matching records found for the specified criteria," and suggest broadening filters.
- How does the system behave when P2P peers provide conflicting versions of the same record? The system must use source-system filing IDs and timestamps to resolve to the most authoritative version and flag the conflict in audit logs.
- What happens when a self-hosted node has only a partial P2P bundle? The system must clearly indicate which date ranges and data sources are present locally and warn users when a query falls outside available data.
- How does the system handle entities whose identities are merged or split after deduplication logic changes? The system must maintain a mapping from old IDs to new IDs and include this in migration notes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST ingest and normalize federal campaign finance data (FEC) on a recurring schedule, deduplicating entities by name variants, IDs, and contextual signals, assigning persistent internal identifiers.
- **FR-002**: System MUST ingest and normalize federal lobbying registration and activity disclosures, linking lobbyists, clients, and issues to graph entities.
- **FR-003**: System MUST ingest initial state-level campaign finance and lobbying data, starting with the five largest states by campaign spending (California, Texas, New York, Florida, Illinois) in that priority order, expanding to additional states over time.
- **FR-004**: System MUST ingest corporate and organizational registry data sufficient to link parent/subsidiary structures to donors and lobbying clients.
- **FR-005**: System MUST construct a time-aware influence graph where entities (donors, PACs, corporations, committees, legislators, bills, agencies) and relationships (donations, lobbying engagements, affiliations, votes, contracts) carry temporal attributes, enabling reconstruction of the graph as of any specific date or legislative session.
- **FR-006**: System MUST provide full-text and structured search across entities by name, with filters for jurisdiction, entity type, sector, and date range, returning results within 2 seconds at the 95th percentile.
- **FR-007**: System MUST provide per-entity dashboards showing: inbound/outbound funding totals, top counterparties, sector breakdowns, lobbying ties, and relevant roll-call votes. Each aggregated number MUST link to the underlying individual records.
- **FR-008**: System MUST provide interactive graph and table views with filters for date range, sector, jurisdiction, and amount thresholds. Users MUST be able to switch between graph and table representations of the same filtered result set.
- **FR-009**: System MUST provide an in-browser AI question interface using only browser-local LLM inference. The interface MUST display the structured query generated from the user's natural-language input, a neutral narrative summary, and links to every underlying record. No prompts or investigative context may be sent to remote AI services.
- **FR-010**: System MUST allow users to save queries and dashboard configurations and share them via URLs or content hashes. Users MUST be able to export result sets as CSV or JSON.
- **FR-011**: System MUST provide a browser extension that detects recognized entities on visited web pages, displays summary overlay cards (top funding sectors, major donors, voting patterns), and links back to full CIG dashboards.
- **FR-012**: System MUST provide a ballot explorer mode (accessible via the browser extension or main UI) where a user enters an address and sees compact influence cards for each candidate in their races.
- **FR-013**: System MUST support P2P dataset export and replication: periodic and incremental snapshots distributable and replicable via peer-to-peer protocols, supporting sparse reads (downloading only accessed segments).
- **FR-014**: System MUST provide a "Replication" admin section where operators see which P2P datasets they seed and follow, along with sync status and peer counts.
- **FR-015**: System MUST provide REST and/or GraphQL APIs for query-level access, plus bulk export endpoints producing versioned snapshots with stable entity identifiers, source-system references, and change logs.
- **FR-016**: System MUST log how every AI-assisted answer is produced: which data subsets, time ranges, query parameters, and model version were used, for audit and reproducibility.
- **FR-017**: System MUST support full self-hosted operation from local or P2P-bootstrapped data when upstream public APIs are unavailable.
- **FR-018**: All ranking, anomaly detection, and surfacing MUST operate on behavioral and structural signals only (amounts, timing, relationships, network structure, documented lobbying, votes). The system MUST NOT single out or prioritize entities based on protected characteristics.
- **FR-019**: System MUST redact private addresses and contact details beyond what is legally mandated in public disclosures. The system MUST NOT attempt to de-anonymize aggregations or enrich records with dubious third-party personal data.

### Key Entities

- **Person**: An individual (legislator, donor, lobbyist, executive). Key attributes: name variants, jurisdictions, roles, party affiliation (for legislators), committee memberships, stable internal ID, source-system IDs.
- **Committee**: A campaign committee, PAC, Super PAC, or party committee. Key attributes: name, type, jurisdiction, treasurer, associated candidates, active date ranges.
- **Organization**: A corporation, nonprofit, trade association, or other entity that donates, lobbies, or employs lobbyists. Key attributes: name, industry/sector, parent–subsidiary relationships, registered addresses.
- **Bill**: A piece of legislation at the federal or state level. Key attributes: title, number, session, sponsors, committee referrals, roll-call vote outcomes.
- **Donation**: A financial transfer from one entity to another (individual-to-committee, PAC-to-PAC, etc.). Key attributes: amount, date, source entity, destination entity, election cycle, filing reference.
- **Lobbying Engagement**: A registered lobbying relationship linking a lobbying firm or individual to a client and a set of issues/bills. Key attributes: registrant, client, issues, covered agencies, active period, filing reference.
- **Vote**: A roll-call vote by a legislator on a bill. Key attributes: legislator, bill, vote (yea/nay/present/not voting), date.
- **Sector/Industry**: A classification grouping entities by economic sector (e.g., Defense, Healthcare, Energy). Used for aggregation and filtering.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with no prior knowledge of the platform can search for a legislator by name and reach a populated dashboard within 60 seconds of first visit.
- **SC-002**: 95% of interactive search and dashboard queries complete within 2 seconds under normal load.
- **SC-003**: The in-browser AI question interface produces an answer with evidence links for a typical influence question within 10 seconds, with no network requests to external AI services.
- **SC-004**: A self-hosted node bootstrapped from a P2P bundle supports full search, dashboard, and AI query functionality with zero upstream API connectivity.
- **SC-005**: Bulk exports and P2P bundles include stable entity identifiers and change logs such that a researcher can diff two successive snapshots and identify all new, updated, and removed records.
- **SC-006**: At least one national and multiple local newsrooms or NGOs publish stories or reports citing CIG data within the first year of public availability.
- **SC-007**: At least three independent third-party mirrors/peers seed P2P bundles, demonstrating data resilience beyond a single host.
- **SC-008**: Every aggregated number displayed in the UI is drill-downable to individual source records within two clicks.
- **SC-009**: The full system (minus upstream data endpoints) can be installed and running on a single machine following documented steps in under one hour.

## Assumptions

- Initial data scope focuses on U.S. federal data (FEC, Senate/House lobbying disclosures, congressional votes); state-level data is additive and will be prioritized after the federal foundation is stable.
- Users have modern browsers with WebGPU or WebAssembly support for in-browser LLM inference; older browsers will gracefully degrade to non-AI features.
- Mobile-native apps are out of scope for v1; the web UI should be responsive but a dedicated mobile app is not planned.
- The platform does not require user accounts for read-only access; authentication is needed only for saved queries, operator/admin functions, and rate-limited API access.
- Entity deduplication will use deterministic and probabilistic matching heuristics; perfect deduplication is not expected, but all merge decisions must be auditable and reversible.
- The in-browser LLM will be a small, general-purpose model suitable for query translation and summarization, not a frontier-scale model; answer quality is bounded by model capability and local data availability.
- P2P replication uses Hypercore-ecosystem protocols as the primary distribution mechanism; alternative P2P protocols (e.g., IPFS) are out of scope for v1 but the architecture should not preclude future additions.
- Data ingestion frequency for FEC and lobbying data matches the publication cadence of the upstream sources (typically quarterly bulk files with more frequent incremental updates).

## Resolved Questions

- **State-level data scope**: Initial state-level ingestion targets the five largest states by campaign spending — California, Texas, New York, Florida, Illinois — in that priority order. Additional states will be added incrementally after the federal and initial-state foundation is stable.
- **P2P trust governance**: Community reputation model — any peer can host and seed data. The UI displays peer count, uptime, and data-freshness indicators as trust signals. There is no centralized authority designating "official" mirrors; users evaluate peers based on observable reputation metrics.
- **Self-host hardware profile**: No minimum hardware specification is prescribed. Self-hosters are expected to test their own machines and determine suitability. Documentation will describe the data volumes and workload characteristics so operators can make informed decisions.
