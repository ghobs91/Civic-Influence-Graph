# Research: Civic Influence Platform

**Date**: 2026-03-26
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## 1. Graph Storage: Apache AGE on PostgreSQL

**Decision**: Use Apache AGE (graph-on-PostgreSQL) as the primary graph layer.

**Rationale**:
- Single storage engine: graph data and relational data (FEC filings, lobbying, org records) share one PostgreSQL instance, one backup strategy, one docker-compose service, one transaction boundary. Directly satisfies Constitution IX (fewest moving parts).
- openCypher support for pattern matching and 2-3 hop traversals — the primary query type for influence exploration.
- Hybrid SQL+Cypher: join graph traversal results with relational tables in a single query, critical for linking graph edges back to source filings.
- AGE v1.7.0 (Jan 2026), supports PG 11-18, 4.3k GitHub stars, 98 contributors, active Apache Foundation governance, monthly commits.
- Temporal modeling via properties: `WHERE e.date >= $start AND e.date <= $end` in Cypher, combined with PostgreSQL date functions.
- Scale: tens of millions of nodes and hundreds of millions of edges are within PostgreSQL's range with proper partitioning, indexing, and adequate hardware.

**Limitations to plan for**:
- No built-in graph analytics library (no PageRank, Louvain, betweenness centrality). Batch compute via NetworkX or igraph on exported subgraphs, materialized as precomputed views.
- Cypher query planner less sophisticated than Neo4j for deeply nested optional matches. Acceptable for 2-3 hop traversals; deeper queries may need restructuring.
- Multi-hop traversals are internally SQL joins. Manageable at 2-3 hops; would not scale to 6+ hops on billions of edges.

**Alternatives considered**:
- Neo4j Community: native graph storage + GDS analytics, but AGPL license, separate service (violates IX), no SQL hybrid queries.
- Neo4j + PostgreSQL dual-stack: best analytics but doubles infrastructure (violates IX).
- PostgreSQL recursive CTEs only: verbose, hard to maintain, slow beyond 2 hops.
- Memgraph: Business Source License (not truly open source, violates IV).

---

## 2. P2P Stack: Holepunch/Pear Modules

**Decision**: Proceed with the Holepunch/Pear P2P stack (hypercore, hyperbee, hyperdrive, hyperswarm, hyperdht, corestore, localdrive, mirror-drive).

**Rationale**:
- Actively maintained, stable on Node.js 20+. Hypercore v11.27 (4 days ago), Hyperbee v2.27 (2 months ago), Hyperswarm (last month).
- Clear mapping to CIG needs:
  - **Hypercore** → append-only logs for dataset change feeds.
  - **Hyperbee** → B-tree indices for entity key lookups by ID and name-prefix ranges.
  - **Hyperdrive** → file-system snapshots for bulk dataset exports.
  - **Hyperswarm/HyperDHT** → topic-based peer discovery with NAT traversal and Noise encryption.
  - **Corestore** → factory for managing multiple hypercores per dataset.
  - **Localdrive / Mirror-drive** → mirror between local FS and hyperdrive.
- Hypercore v10+ declared LTS: forward-compatible storage and wire protocol.
- Documentation at docs.pears.com with full API references for core modules.

**Gotchas for Node.js 20+**:
- Hypercore v10+ uses `hypercore-storage`, not the older `random-access-*` modules. Older tutorials are outdated.
- Modules are CommonJS (`require()`); ESM interop via dynamic `import()` or build tool.
- `sodium-native` native dependency: Docker builds need `build-essential`.
- Set `ulimit -n 65536` in Docker containers for large corestores (file descriptor limits).
- Budget ~50-100 MB RAM for hyperswarm connection overhead with hundreds of peers.

**Alternatives considered**:
- IPFS/libp2p: heavier, no append-only log semantics, complex configuration.
- BitTorrent/WebTorrent: no incremental updates, no built-in B-tree index.
- Custom WebSocket sync: enormous effort to replicate existing Holepunch features.

---

## 3. In-Browser AI: WebLLM

**Decision**: Use WebLLM as the in-browser inference engine.

**Rationale**:
- Full OpenAI API compatibility: `engine.chat.completions.create()` with streaming, JSON mode.
- WebGPU acceleration as primary path; WASM/TVM fallback for browsers without WebGPU.
- Recommended model: Phi-3-mini (3.8B, ~2 GB q4f16) or Llama-3.2-1B/3B — small enough for browser download, capable enough for NL-to-query translation.
- Latency: 3-10 s for structured query generation (~100 tokens, WebGPU). Meets spec's 10-second target.
- Web Worker and Service Worker support: inference runs off main thread, persists across navigations.
- Chrome Extension support: documented examples for CIG's browser extension overlay.
- SRI hash verification for model artifacts (Constitution integrity).
- Model cached in browser Cache API/IndexedDB after first download (1-10 min first time, 5-30 s cached init).

**NL-to-query pipeline**:
1. User types natural-language question.
2. WebLLM (Web Worker) receives question + system prompt describing graph schema and Cypher syntax.
3. Model generates structured Cypher query (JSON mode constrains output).
4. Application executes query against local cached data or API.
5. Results passed back to WebLLM for neutral narrative summarization.
6. Both query and summary displayed with evidence links (Constitution II).

**Browser compatibility**:
- WebGPU: Chrome 113+, Edge 113+, Firefox (behind flag), Safari (partial 2026).
- WASM fallback: functional but 5-20x slower, adequate for ≤1B models.
- Mobile Chrome Android: improving but memory limits models to <1B effectively.

**Alternatives considered**:
- Transformers.js: broader model formats but less optimized for generative LLM chat.
- llama.cpp WASM: no WebGPU acceleration, slower.
- Remote API: explicitly prohibited by Constitution VI.
- MediaPipe LLM: smaller model selection, less flexible API.

---

## 4. Entity Search: OpenSearch

**Decision**: Use OpenSearch for entity disambiguation and full-text search.

**Rationale**:
- Entity disambiguation is a critical-path requirement (FR-006: p95 < 2 s) on tens of millions of entities with name variants, abbreviations, and misspellings.
- PostgreSQL `tsvector`/`pg_trgm` is insufficient: slower fuzzy matching at scale, no phonetic analysis chain, limited multi-field weighted ranking.
- OpenSearch provides: Levenshtein automata fuzzy queries, phonetic token filters (Double Metaphone, Beider-Morse), `multi_match` with `cross_fields` and per-field boosting, all integrated into the inverted index.
- Apache 2.0 license (truly open source, satisfies Constitution IV).
- Single container, ~512 MB heap for CIG's entity count.

**Entity disambiguation setup**:
- Analyzer chain: `lowercase` → `asciifolding` → `synonym` (nickname mappings) → `phonetic` (double metaphone) → `edge_ngram` (prefix matching).
- Multi-field mapping: `name`, `name.phonetic`, `name.ngram`, `aliases`, `committee_name`, `employer`.
- Query: `multi_match` with `cross_fields`, fuzziness `AUTO`, field boosting.

**Alternatives considered**:
- Elasticsearch: SSPL license not open source (Constitution IV conflict).
- PostgreSQL FTS + pg_trgm: insufficient for fuzzy multi-field disambiguation at scale.
- Meilisearch/Typesense: insufficient control over analysis pipeline for serious entity disambiguation.

---

## 5. FEC Data Ingestion

**Decision**: Ingest FEC bulk data files directly (pipe-delimited from fec.gov), supplemented by OpenFEC API for incremental updates.

**Rationale**:
- FEC bulk files are the authoritative, complete data source: candidate master, committee master, candidate-committee linkages, individual contributions (4-8 GB/cycle), committee-to-committee transfers, operating expenditures.
- Files are pipe-delimited (`|`), organized by 2-year election cycle, updated weekly to daily near elections.
- OpenFEC API (1,000 req/hour rate limit) is useful for incremental updates and metadata queries, not suitable as primary ingestion path.

**Key challenges**:

| Challenge | Approach |
|-----------|----------|
| Entity deduplication (no universal person ID) | Multi-signal matching: name trigram + phonetic similarity, employer/occupation match, ZIP proximity, contribution patterns. OpenSearch powers fuzzy matching; scoring threshold determines merge candidates. |
| Committee-to-candidate linking | Official linkage file as primary; supplement with contribution-pattern analysis for leadership PACs, Super PACs, joint fundraising committees. |
| Amendment handling (`AMNDT_IND` flag) | Ingest all versions, mark amendments referencing originals, use latest non-terminated as canonical. Store full chain for audit (Constitution XI). |
| Transaction type complexity (dozens of `TRANSACTION_TP` codes) | Mapping table classifying codes to semantic categories (direct contribution, earmark, refund, redesignation, independent expenditure). Handle `MEMO_CD="X"` to avoid double-counting. |
| Incremental updates (bulk files are full snapshots) | Diff using `SUB_ID` + `FILE_NUM` as keys. Insert new records, flag updated, handle amendments. |

**Pipeline**: Download → Parse (stream pipe-delimited into staging tables) → Normalize (names, dates, amounts, transaction types) → Deduplicate (OpenSearch fuzzy + scoring) → Link (graph edges) → Construct (materialize temporal graph in AGE).

**Alternatives considered**:
- OpenFEC API only: rate limit makes full ingestion take weeks.
- OpenSecrets/CRP data: restrictive license, not redistributable (Constitution IV).
- FEC .fec file parsing: use as supplement for real-time filing monitoring, not primary ingestion.

---

## 6. Collaborative Overlay: GunDB

**Decision**: Use GunDB as an optional, non-critical annotation layer with clear architectural boundaries.

**Rationale**:
- Decentralized P2P sync with no required central server (Constitution VII).
- CRDT-based conflict resolution (last-write-wins with vector clocks) — acceptable for annotations and tags.
- Browser + Node.js universal: same JS code, IndexedDB/localStorage backend in browser.
- Cryptographic user ownership via SEA module (signed annotations).
- Tiny footprint (~9 KB gzipped).
- 19k GitHub stars; used by Internet Archive and Iris.to in production.

**Concerns and mitigations**:
- Browser storage eviction: run at least one GunDB relay peer (Node.js process in docker-compose) for disk persistence.
- IndexedDB limits (Chrome ~60% disk, Firefox ~2 GB, Safari ~1 GB): annotations are kilobytes to low megabytes per user — well within limits.
- LWW conflict resolution only: design annotations as small, atomic units (one tag, one short note) so conflicts are per-annotation, not per-document.
- Limited query capabilities: GunDB is a sync layer. Index annotations into local Hyperbee or PostgreSQL for querying.
- Single primary maintainer (Mark Nadal), sporadic commits — core modules stable but ecosystem not rapidly evolving.

**Alternatives considered**:
- Yjs + WebRTC: better for rich-text editing, over-engineered for simple tag/note annotations.
- Automerge: rigorous CRDT but requires custom sync layer, no built-in networking.
- Custom Hypercore-based annotation sync: reuses existing stack but must build conflict resolution from scratch.
- PostgreSQL + WebSocket: requires server connectivity, no offline annotations.

---

## Summary

| Topic | Decision | Key Risk | Mitigation |
|-------|----------|----------|------------|
| Graph DB | Apache AGE on PostgreSQL | No built-in graph analytics | Batch compute via NetworkX/igraph; precomputed materialized views |
| P2P Stack | Holepunch/Pear modules | Niche ecosystem, bus-factor | LTS protocol, stable modules, growing Pear Runtime community |
| Browser AI | WebLLM | WebGPU availability, cold-start latency | Web Worker execution, Cache API persistence, graceful degradation |
| Entity Search | OpenSearch | Adds a service to docker-compose | Single container ~512 MB, justified by disambiguation requirements |
| FEC Ingestion | Bulk files + OpenFEC supplement | Entity deduplication accuracy | Multi-signal fuzzy matching, audit trail, reversible merges |
| Annotations | GunDB (optional) | Single maintainer, limited queries | Strict architectural boundary; relay peer for durability; local index for queries |
