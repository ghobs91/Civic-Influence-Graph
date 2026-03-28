<!--
## Sync Impact Report
- **Version change**: 0.0.0 (template placeholder) → 1.0.0
- **Modified principles**: N/A (initial population from template)
- **Added sections**:
  - Preamble (Purpose and Philosophy)
  - 12 Core Principles (I–XII)
  - Development Guidelines for AI-Assisted Workflows
  - Governance (with amendment procedure and versioning policy)
  - Amendments (empty, reserved for future changes)
- **Removed sections**: None (template placeholders replaced)
- **Templates requiring updates**:
  - `.specify/templates/plan-template.md` — ✅ No update needed
    (Constitution Check is dynamically filled by /speckit.plan)
  - `.specify/templates/spec-template.md` — ✅ No update needed
    (no direct constitution references to update)
  - `.specify/templates/tasks-template.md` — ✅ No update needed
    (no direct constitution references to update)
- **Follow-up TODOs**: None
-->

# Civic Influence Graph (CIG) Constitution

## Purpose and Philosophy

**Scope.** Open-source, identity-neutral, self-hostable platform that
maps money, lobbying, and legislative behavior in U.S. politics, with
AI-assisted analysis running entirely in the browser and P2P data
distribution.

**Spec-driven development.** Specifications are the primary source of
truth. Code exists to faithfully implement the spec and this
constitution, in line with Spec Kit's spec-first workflow.

**Civic transparency, not targeting.** CIG provides non-partisan,
identity-neutral transparency into political influence networks,
focusing on observable behavior: money flows, lobbying, and
legislative actions.

**Resilient public knowledge.** Once data is collected and structured,
it MUST remain accessible even if central APIs or data sources are
throttled or removed, via P2P replication.

## Core Principles

### I. Identity-Neutral Analysis

The system MUST NOT single out or prioritize entities based on
protected characteristics (religion, ethnicity, nationality, race,
gender, etc.).

All ranking, anomaly detection, and surfacing MUST be based on
behavioral and structural signals only:

- Amounts and timing of financial transactions
- Relationships and network structure
- Documented lobbying activities
- Legislative votes and roll-call records

### II. Evidence and Provenance First

Every surfaced pattern or AI-generated explanation MUST be traceable
back to documented underlying records: filings, roll-call votes,
lobbying disclosures, and graph edges.

UIs MUST make it straightforward to "drill down" from high-level
insights to raw records and the exact queries used to produce them.

### III. Transparency of the Tool Itself

CIG's own funding sources, maintainers, and major contributors MUST
be disclosed in a machine-readable form, ideally represented within
the same graph the platform exposes.

Key governance decisions (e.g., adding/removing data sources, changing
scoring or deduplication logic) MUST be documented and versioned
in-repo.

### IV. Open Data and Open Source by Default

Core backend logic, ingestion pipelines, schemas, and non-sensitive
data transformations MUST be open source.

Public data ingested from official or open civic sources MUST be
exportable and accessible via documented APIs and P2P bundles,
subject to privacy and legal constraints.

### V. Privacy and Safety

- **No doxxing:** The system MUST NOT surface private addresses or
  contact details beyond what is already standard and legally
  mandated in public disclosures. Apply redaction and aggregation
  where feasible.
- The system MUST NOT attempt to de-anonymize aggregations or enrich
  records with dubious third-party personal data.

### VI. Explainable, Client-Side AI

All LLM inference used for product features MUST run in the user's
browser using WebLLM or a similar in-browser engine
(WebGPU/WebAssembly), not centralized AI APIs.

AI outputs MUST be explainable: the system MUST show which data
subsets, time windows, and query structures were used to produce a
narrative or answer.

### VII. Local-First and P2P-Resilient

The platform MUST remain meaningfully usable in degraded or offline
modes, using locally cached data and peer-to-peer replication.

Public datasets MUST be packageable into Hypercore/Hyperbee/Hyperdrive
structures and distributed via Hyperswarm/HyperDHT, using Pear's
documented P2P modules as building blocks.

Browser nodes and servers MAY collaborate via decentralized graph
replication (e.g., via GunDB or similar) for annotations and
overlays.

### VIII. Self-Hostability as a First-Class Requirement

It MUST be possible to run the full system (minus upstream
public-data endpoints) on a single machine with documented steps.

No essential feature MAY require proprietary managed services; cloud
offerings are optional accelerators, not hard dependencies.

### IX. Simplicity Over Cleverness

Prefer the fewest moving parts that satisfy the spec. New services or
infrastructure layers require an explicit justification tied to
scale, performance, or clear maintainability benefits, consistent
with Spec Kit's emphasis on pragmatic simplicity.

### X. Test-First for Critical Paths

Critical paths—data ingestion, identity resolution, graph
construction, P2P export/import, and ranking/alerting—MUST be
covered by automated tests.

Contract-style tests MUST capture key behavioral scenarios (e.g.,
"detect sudden sector-level donation spikes before a vote").

### XI. Auditability and Reproducibility

Any surfaced insight MUST be reconstructable from:

1. A specific data snapshot or P2P bundle,
2. A code version, and
3. A configuration (queries, thresholds).

Changes to schemas, deduplication logic, scoring, or P2P formats MUST
include migration notes and, where feasible, backfill steps.

### XII. Constitutional Evolution

Changes to this constitution require:

1. A written rationale, captured in the Amendments section below.
2. At least one maintainer's explicit approval via version control.
3. A documented assessment of backward-compatibility impacts (APIs,
   data, UX).

Once merged, amendments become binding on subsequent specs and plans,
mirroring Spec Kit's "governance as code" philosophy.

## Development Guidelines for AI-Assisted Workflows

All `/speckit.specify` and `/speckit.plan` outputs MUST:

- Explicitly check for identity-based targeting and reject or reframe
  such designs.
- Consider P2P, local-first, and self-hosted implications.

When prompts or requirements are ambiguous, AI agents MUST mark
`[NEEDS CLARIFICATION: …]` instead of guessing, consistent with
Spec Kit guidance.

Any AI-generated schemas, code, or documentation MUST undergo human
review before merging to main branches.

## Governance

This constitution supersedes all other project practices and
conventions. All PRs and reviews MUST verify compliance with the
principles above.

### Amendment Procedure

1. Author a written rationale and add it to the Amendments section.
2. Obtain at least one maintainer's explicit approval via version
   control (pull request review).
3. Document backward-compatibility impacts on APIs, data formats,
   and user experience.
4. Update the constitution version per the versioning policy below.

### Versioning Policy

The constitution follows semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Backward-incompatible governance or principle removals
  or redefinitions.
- **MINOR**: New principle or section added, or materially expanded
  guidance.
- **PATCH**: Clarifications, wording, typo fixes, non-semantic
  refinements.

### Compliance Review

Every spec and plan produced by Spec Kit workflows MUST include a
Constitution Check gate that validates alignment with the principles
defined here. Violations MUST be resolved or explicitly justified
before implementation proceeds.

## Amendments

No amendments yet. Future changes will be recorded here with
rationale, date, and version bump.

**Version**: 1.0.0 | **Ratified**: 2026-03-26 | **Last Amended**: 2026-03-26
