/**
 * NL-to-Cypher pipeline (T048).
 *
 * Takes a natural-language question, sends it to the in-browser LLM
 * with a system prompt describing the graph schema, and parses the
 * generated Cypher query for execution against the API.
 */

import type { ChatMessage } from './webllm.js';
import { chatCompletion } from './webllm.js';

// ============================================================
// TYPES
// ============================================================

export interface GeneratedQuery {
  cypher: string;
  parameters: Record<string, unknown>;
  explanation: string;
}

export interface PipelineResult {
  success: boolean;
  query?: GeneratedQuery;
  error?: string;
  rawOutput?: string;
}

// ============================================================
// GRAPH SCHEMA DESCRIPTION (for system prompt)
// ============================================================

const GRAPH_SCHEMA = `
Graph name: influence (Apache AGE on PostgreSQL)

NODE LABELS:
- Person: id, canonical_name, entity_type (legislator|donor|lobbyist), party, jurisdictions[], roles[], employer
- Committee: id, name, committee_type (candidate|pac|super_pac|party|joint_fundraising), jurisdiction, associated_candidate_id
- Organization: id, name, org_type (corporation|nonprofit|trade_association|lobbying_firm), sector_id, industry, jurisdiction
- Bill: id, bill_number, title, chamber (house|senate|joint), status, sponsors
- Sector: id, name, code

EDGE LABELS (with temporal properties):
- DONATED_TO: (Person|Committee|Organization) -> Committee
  Properties: amount (numeric), transaction_date (ISO date), transaction_type, filing_id, election_cycle, is_memo (boolean)
- LOBBIED_FOR: Organization -> Organization
  Properties: income (numeric), expenses (numeric), period_start (ISO date), period_end (ISO date), issues, specific_issues
- LOBBIED_BY: Person -> Organization
  Properties: period_start, period_end
- VOTED_ON: Person -> Bill
  Properties: vote_cast (yea|nay|present|not_voting), vote_date (ISO date), roll_call_number, chamber
- SPONSORED: Person -> Bill
  Properties: introduced_date (ISO date)
- AFFILIATED_WITH: any -> any
  Properties: affiliation_type (employment|board_member|subsidiary|joint_fundraising|leadership_pac), start_date, end_date
- IN_SECTOR: Organization -> Sector
- PARENT_OF: Organization -> Organization
`.trim();

// ============================================================
// SYSTEM PROMPT
// ============================================================

export const SYSTEM_PROMPT = `You are a data query assistant for a civic influence graph database. Your task is to translate natural-language questions into Apache AGE Cypher queries.

SCHEMA:
${GRAPH_SCHEMA}

RULES:
1. Output ONLY valid JSON with keys: "cypher", "parameters", "explanation"
2. Use parameterized queries - place variable values in "parameters" using $param_name syntax
3. Always include a LIMIT clause (default 50, max 200)
4. Use the graph name 'influence' in all queries
5. Filter out is_memo = true donations unless specifically asked
6. Date comparisons use ISO-8601 format (YYYY-MM-DD)
7. Amount comparisons are numeric, no currency symbols
8. For aggregations, prefer SUM and COUNT over individual records
9. Always return node identifiers (id, name) alongside data
10. Use MATCH patterns that follow the edge directions defined above

EXAMPLES:
Question: "Who donated the most to PAC Fund in 2025?"
Answer: {"cypher":"MATCH (d)-[don:DONATED_TO]->(c:Committee {name: $committee_name}) WHERE don.transaction_date >= $start AND don.transaction_date <= $end AND don.is_memo = false RETURN d.canonical_name AS donor, SUM(don.amount) AS total, COUNT(don) AS donations ORDER BY total DESC LIMIT 20","parameters":{"committee_name":"PAC Fund","start":"2025-01-01","end":"2025-12-31"},"explanation":"Finding top donors to PAC Fund in calendar year 2025"}

Question: "What defense companies lobbied in 2024?"
Answer: {"cypher":"MATCH (org:Organization)-[l:LOBBIED_FOR]->(target:Organization), (org)-[:IN_SECTOR]->(s:Sector {code: $sector}) WHERE l.period_start >= $start RETURN DISTINCT org.name, l.income, l.issues ORDER BY l.income DESC LIMIT 50","parameters":{"sector":"DEF","start":"2024-01-01"},"explanation":"Listing defense sector organizations with lobbying activity starting in 2024"}`;

// ============================================================
// QUERY VALIDATION
// ============================================================

const VALID_NODE_LABELS = new Set(['Person', 'Committee', 'Organization', 'Bill', 'Sector']);
const VALID_EDGE_LABELS = new Set([
  'DONATED_TO', 'LOBBIED_FOR', 'LOBBIED_BY', 'VOTED_ON',
  'SPONSORED', 'AFFILIATED_WITH', 'IN_SECTOR', 'PARENT_OF',
]);

/** Patterns that suggest injection or dangerous operations. */
const DANGEROUS_PATTERNS = [
  /\bDELETE\b/i,
  /\bDROP\b/i,
  /\bCREATE\b/i,
  /\bSET\b/i,
  /\bREMOVE\b/i,
  /\bDETACH\b/i,
  /\bMERGE\b/i,
  /\bCALL\b/i,
  /\bFOREACH\b/i,
];

/**
 * Validate a generated Cypher query for safety and correctness.
 * Returns null if valid, or an error message if invalid.
 */
export function validateCypher(cypher: string): string | null {
  if (!cypher || cypher.trim().length === 0) {
    return 'Empty query';
  }

  // Check for dangerous write/mutation patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cypher)) {
      return `Disallowed operation: ${pattern.source}`;
    }
  }

  // Must contain MATCH (read-only)
  if (!/\bMATCH\b/i.test(cypher)) {
    return 'Query must contain a MATCH clause';
  }

  // Must contain RETURN
  if (!/\bRETURN\b/i.test(cypher)) {
    return 'Query must contain a RETURN clause';
  }

  // Extract node/edge labels from patterns like (var:Label) or [var:LABEL]
  const labelMatches = cypher.matchAll(/[([\-]\w*:(\w+)/g);
  for (const match of labelMatches) {
    const label = match[1];
    if (!VALID_NODE_LABELS.has(label) && !VALID_EDGE_LABELS.has(label)) {
      return `Unknown label: ${label}`;
    }
  }

  return null;
}

// ============================================================
// PIPELINE
// ============================================================

/**
 * Generate a Cypher query from a natural-language question.
 * Calls the in-browser LLM with the graph schema system prompt
 * and parses the JSON response.
 */
export async function generateQuery(question: string): Promise<PipelineResult> {
  if (!question.trim()) {
    return { success: false, error: 'Question cannot be empty' };
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];

  let response;
  try {
    response = await chatCompletion(messages, {
      temperature: 0.1,
      max_tokens: 1024,
      json_mode: true,
    });
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'LLM inference failed',
    };
  }

  const raw = response.content.trim();

  // Parse JSON output
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: 'Failed to parse LLM JSON output', rawOutput: raw };
  }

  const cypher = typeof parsed.cypher === 'string' ? parsed.cypher : '';
  const parameters =
    parsed.parameters && typeof parsed.parameters === 'object' && !Array.isArray(parsed.parameters)
      ? (parsed.parameters as Record<string, unknown>)
      : {};
  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : '';

  // Validate Cypher
  const validationError = validateCypher(cypher);
  if (validationError) {
    return { success: false, error: `Invalid query: ${validationError}`, rawOutput: raw };
  }

  return {
    success: true,
    query: { cypher, parameters, explanation },
    rawOutput: raw,
  };
}

/**
 * Build a generate-query prompt for testing or external use.
 * Exported to allow unit tests without calling the actual LLM.
 */
export function buildMessages(question: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ];
}
