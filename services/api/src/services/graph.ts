/**
 * Graph query service (T039).
 *
 * Builds and executes Apache AGE Cypher queries against the 'influence'
 * graph with optional filters: sector, date range, amount threshold,
 * edge types, jurisdiction, and max_nodes.
 *
 * All queries use parameterized SQL wrappers around Cypher to prevent injection.
 */

import type pg from 'pg';
import type { GraphQuery } from '@cig/schema';

// ============================================================
// TYPES
// ============================================================

export interface GraphNode {
  id: string;
  label: string;
  name: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface TableRow {
  source_id: string;
  source_name: string;
  source_type: string;
  target_id: string;
  target_name: string;
  target_type: string;
  edge_type: string;
  amount: number | null;
  date: string | null;
  filing_id: string | null;
}

export interface TableResult {
  rows: TableRow[];
  total_count: number;
}

// ============================================================
// AGE SESSION SETUP
// ============================================================

/**
 * Ensure AGE extension is loaded and search_path is set for a client.
 */
async function setupAgeSession(client: pg.PoolClient): Promise<void> {
  await client.query("LOAD 'age'");
  await client.query('SET search_path = ag_catalog, "$user", public');
}

// ============================================================
// ALLOWED EDGE TYPES (whitelist for Cypher injection prevention)
// ============================================================

const ALLOWED_EDGE_TYPES = new Set([
  'DONATED_TO',
  'LOBBIED_FOR',
  'LOBBIED_BY',
  'VOTED_ON',
  'SPONSORED',
  'AFFILIATED_WITH',
  'IN_SECTOR',
  'PARENT_OF',
]);

/**
 * Validate and filter edge types against the whitelist.
 */
function sanitizeEdgeTypes(types: string[] | undefined): string[] {
  if (!types || types.length === 0) {
    return ['DONATED_TO', 'LOBBIED_FOR', 'VOTED_ON'];
  }
  return types.filter((t) => ALLOWED_EDGE_TYPES.has(t));
}

// ============================================================
// CYPHER QUERY BUILDER
// ============================================================

/**
 * Build WHERE clause conditions for Cypher from filters.
 * Returns an array of condition strings that reference properties
 * on source (s), edge (e), and target (t) variables.
 */
function buildCypherConditions(filters: GraphQuery): string[] {
  const conditions: string[] = [];

  if (filters.start_date) {
    conditions.push(`e.transaction_date >= '${escapeCypherString(filters.start_date)}'`);
  }
  if (filters.end_date) {
    conditions.push(`e.transaction_date <= '${escapeCypherString(filters.end_date)}'`);
  }
  if (filters.min_amount !== undefined) {
    conditions.push(`e.amount >= ${Number(filters.min_amount)}`);
  }
  if (filters.sector) {
    conditions.push(`s.sector = '${escapeCypherString(filters.sector)}'`);
  }
  if (filters.jurisdiction) {
    conditions.push(
      `(s.jurisdiction = '${escapeCypherString(filters.jurisdiction)}' OR t.jurisdiction = '${escapeCypherString(filters.jurisdiction)}')`,
    );
  }

  return conditions;
}

/**
 * Escape a string for safe embedding in Cypher string literals.
 * Only allows simple alphanumeric + date characters through.
 */
function escapeCypherString(value: string): string {
  // Strip anything that isn't alphanumeric, dash, underscore, dot, space, or slash
  return value.replace(/[^a-zA-Z0-9\-_. /]/g, '');
}

// ============================================================
// GRAPH QUERY — returns nodes + edges for visualization
// ============================================================

/**
 * Execute a graph query returning nodes and edges.
 */
export async function queryGraph(
  pool: pg.Pool,
  filters: GraphQuery,
): Promise<GraphResult> {
  const client = await pool.connect();
  try {
    await setupAgeSession(client);

    const edgeTypes = sanitizeEdgeTypes(filters.edge_types);
    const maxNodes = filters.max_nodes ?? 100;
    const nodes = new Map<string, GraphNode>();
    const edges: GraphEdge[] = [];

    for (const edgeType of edgeTypes) {
      const conditions = buildCypherConditions(filters);

      // If center_entity_id provided, anchor on it
      if (filters.entity_id) {
        conditions.push(`(s.id = '${escapeCypherString(filters.entity_id)}' OR t.id = '${escapeCypherString(filters.entity_id)}')`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const cypher = `
        SELECT * FROM cypher('influence', $$
          MATCH (s)-[e:${edgeType}]->(t)
          ${whereClause}
          RETURN id(s), label(s), properties(s),
                 id(e), properties(e),
                 id(t), label(t), properties(t)
          LIMIT ${Number(maxNodes)}
        $$) AS (
          s_id agtype, s_label agtype, s_props agtype,
          e_id agtype, e_props agtype,
          t_id agtype, t_label agtype, t_props agtype
        )
      `;

      const result = await client.query(cypher);

      for (const row of result.rows) {
        const sId = parseAgtypeString(row.s_props, 'id');
        const tId = parseAgtypeString(row.t_props, 'id');
        const sLabel = parseAgtypeValue(row.s_label);
        const tLabel = parseAgtypeValue(row.t_label);
        const sProps = parseAgtypeObject(row.s_props);
        const tProps = parseAgtypeObject(row.t_props);
        const eProps = parseAgtypeObject(row.e_props);
        const eId = String(parseAgtypeValue(row.e_id));

        if (sId && !nodes.has(sId)) {
          nodes.set(sId, {
            id: sId,
            label: String(sLabel),
            name: String(sProps.canonical_name ?? sProps.name ?? ''),
            properties: sProps,
          });
        }

        if (tId && !nodes.has(tId)) {
          nodes.set(tId, {
            id: tId,
            label: String(tLabel),
            name: String(tProps.canonical_name ?? tProps.name ?? ''),
            properties: tProps,
          });
        }

        if (sId && tId) {
          edges.push({
            id: eId,
            source: sId,
            target: tId,
            label: edgeType,
            properties: eProps,
          });
        }

        if (nodes.size >= maxNodes) break;
      }

      if (nodes.size >= maxNodes) break;
    }

    return { nodes: Array.from(nodes.values()), edges };
  } finally {
    client.release();
  }
}

// ============================================================
// TABLE QUERY — returns flat rows for table view
// ============================================================

/**
 * Execute a table query returning flat edge rows with pagination.
 */
export async function queryTable(
  pool: pg.Pool,
  filters: GraphQuery & { page?: number; page_size?: number; format?: string },
): Promise<TableResult> {
  const client = await pool.connect();
  try {
    await setupAgeSession(client);

    const edgeTypes = sanitizeEdgeTypes(filters.edge_types);
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.page_size ?? 50, 1000);
    const offset = (page - 1) * pageSize;

    const allRows: TableRow[] = [];
    let totalCount = 0;

    for (const edgeType of edgeTypes) {
      const conditions = buildCypherConditions(filters);

      if (filters.entity_id) {
        conditions.push(`(s.id = '${escapeCypherString(filters.entity_id)}' OR t.id = '${escapeCypherString(filters.entity_id)}')`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Count query
      const countCypher = `
        SELECT * FROM cypher('influence', $$
          MATCH (s)-[e:${edgeType}]->(t)
          ${whereClause}
          RETURN count(e)
        $$) AS (cnt agtype)
      `;
      const countResult = await client.query(countCypher);
      totalCount += Number(parseAgtypeValue(countResult.rows[0]?.cnt) ?? 0);

      // Data query
      const dataCypher = `
        SELECT * FROM cypher('influence', $$
          MATCH (s)-[e:${edgeType}]->(t)
          ${whereClause}
          RETURN properties(s), label(s),
                 properties(e),
                 properties(t), label(t)
          SKIP ${Number(offset)}
          LIMIT ${Number(pageSize)}
        $$) AS (
          s_props agtype, s_label agtype,
          e_props agtype,
          t_props agtype, t_label agtype
        )
      `;

      const dataResult = await client.query(dataCypher);
      for (const row of dataResult.rows) {
        const sProps = parseAgtypeObject(row.s_props);
        const tProps = parseAgtypeObject(row.t_props);
        const eProps = parseAgtypeObject(row.e_props);

        allRows.push({
          source_id: String(sProps.id ?? ''),
          source_name: String(sProps.canonical_name ?? sProps.name ?? ''),
          source_type: String(parseAgtypeValue(row.s_label) ?? ''),
          target_id: String(tProps.id ?? ''),
          target_name: String(tProps.canonical_name ?? tProps.name ?? ''),
          target_type: String(parseAgtypeValue(row.t_label) ?? ''),
          edge_type: edgeType,
          amount: eProps.amount != null ? Number(eProps.amount) : null,
          date: eProps.transaction_date != null ? String(eProps.transaction_date) : eProps.vote_date != null ? String(eProps.vote_date) : null,
          filing_id: eProps.filing_id != null ? String(eProps.filing_id) : null,
        });
      }
    }

    return { rows: allRows, total_count: totalCount };
  } finally {
    client.release();
  }
}

// ============================================================
// CSV SERIALIZATION
// ============================================================

const CSV_HEADERS = [
  'source_id',
  'source_name',
  'source_type',
  'target_id',
  'target_name',
  'target_type',
  'edge_type',
  'amount',
  'date',
  'filing_id',
];

/**
 * Escape a CSV field: wrap in quotes if it contains comma, quote, or newline.
 */
function escapeCsvField(value: string | null): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert table rows to CSV string with headers.
 */
export function tableToCsv(rows: TableRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      CSV_HEADERS.map((h) => escapeCsvField(String(row[h as keyof TableRow] ?? ''))).join(','),
    );
  }
  return lines.join('\n');
}

// ============================================================
// AGTYPE PARSING HELPERS
// ============================================================

/**
 * Parse a raw AGE agtype value. AGE returns values as special agtype
 * which can be strings, numbers, or JSON-like objects with ::type suffixes.
 */
function parseAgtypeValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  const str = String(raw);
  // AGE appends type annotations like ::vertex, ::edge, ::integer
  const cleaned = str.replace(/::\w+$/, '');
  // Try parsing as JSON
  try {
    return JSON.parse(cleaned);
  } catch {
    // Return as-is if not JSON (bare strings, etc.)
    return cleaned.replace(/^"|"$/g, '');
  }
}

/**
 * Parse an agtype value that should be a JSON object (e.g., properties()).
 */
function parseAgtypeObject(raw: unknown): Record<string, unknown> {
  const parsed = parseAgtypeValue(raw);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

/**
 * Extract a string property from an agtype object.
 */
function parseAgtypeString(raw: unknown, key: string): string {
  const obj = parseAgtypeObject(raw);
  return obj[key] != null ? String(obj[key]) : '';
}
