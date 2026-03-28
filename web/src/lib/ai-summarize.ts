/**
 * Result summarization pipeline with constitutional guardrails (T049).
 *
 * Feeds graph query results to the in-browser LLM for neutral narrative
 * generation. Enforces Constitutional Principle VI: no moral judgments,
 * no identity-based targeting, no recommendations.
 */

import type { ChatMessage } from './webllm.js';
import { chatCompletion, chatCompletionStream } from './webllm.js';
import type { GraphNode, GraphEdge, TableRow } from './api-client.js';

// ============================================================
// TYPES
// ============================================================

export interface SummarizeInput {
  question: string;
  cypher: string;
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  rows?: TableRow[];
  resultCount: number;
}

export interface SummaryResult {
  summary: string;
  violations: GuardrailViolation[];
  passed: boolean;
}

export interface GuardrailViolation {
  pattern: string;
  matched: string;
  severity: 'warning' | 'block';
}

// ============================================================
// GUARDRAIL SYSTEM PROMPT
// ============================================================

export const SUMMARIZE_SYSTEM_PROMPT = `You are a neutral data analyst for a civic influence database. Summarize query results as factual observations ONLY.

STRICT RULES:
1. Report ONLY amounts, dates, transaction types, entity names, and counts
2. Use passive voice: "A total of $X was donated" not "They donated $X"
3. Do NOT make value judgments — no words like "corrupt", "suspicious", "alarming", "controversial", "scandalous"
4. Do NOT profile by identity, demographics, party affiliation, or personal characteristics
5. Do NOT make recommendations or suggest actions
6. EVERY number must reference its source (filing ID, roll-call number, or date range)
7. If results are empty, state "No matching records were found for the given criteria"
8. Keep summaries under 300 words
9. Use bullet points for multiple data points
10. Start with a one-sentence overview, then list key data points

FORMAT:
- Overview sentence
- Bullet points with cited data
- Total record count at the end`;

// ============================================================
// GUARDRAIL PATTERNS
// ============================================================

/** Blocklist patterns — summaries containing these are rejected. */
const BLOCK_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\b(corrupt|scandal|scandalous|crooked|criminal)\b/i, label: 'moral_judgment' },
  { regex: /\b(suspicious|alarming|disturbing|outrageous|shocking)\b/i, label: 'value_judgment' },
  { regex: /\b(you should|we recommend|take action|vote for|vote against)\b/i, label: 'recommendation' },
  { regex: /\b(tend to|are known for|typically|usually)\b/i, label: 'generalization' },
];

/** Warning patterns — flagged but not rejected. */
const WARN_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\b(good|bad|better|worse|best|worst)\b/i, label: 'evaluative_language' },
  { regex: /\b(all|every|none|always|never)\b/i, label: 'absolute_language' },
  { regex: /\b(clearly|obviously|evidently)\b/i, label: 'editorializing' },
];

/**
 * Check a summary against constitutional guardrails.
 * Returns violations found (both warnings and blocks).
 */
export function checkGuardrails(text: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];

  for (const { regex, label } of BLOCK_PATTERNS) {
    const match = regex.exec(text);
    if (match) {
      violations.push({
        pattern: label,
        matched: match[0],
        severity: 'block',
      });
    }
  }

  for (const { regex, label } of WARN_PATTERNS) {
    const match = regex.exec(text);
    if (match) {
      violations.push({
        pattern: label,
        matched: match[0],
        severity: 'warning',
      });
    }
  }

  return violations;
}

// ============================================================
// DATA FORMATTING
// ============================================================

function formatResultsForPrompt(input: SummarizeInput): string {
  const parts: string[] = [];

  parts.push(`Question: ${input.question}`);
  parts.push(`Query: ${input.cypher}`);
  parts.push(`Total results: ${input.resultCount}`);

  if (input.rows && input.rows.length > 0) {
    // Show up to 20 rows as tabular summary
    const sample = input.rows.slice(0, 20);
    parts.push('\nData rows:');
    for (const row of sample) {
      const amount = row.amount != null ? `$${row.amount.toLocaleString()}` : 'N/A';
      parts.push(
        `- ${row.source_name} (${row.source_type}) → ${row.target_name} (${row.target_type}): ${row.edge_type}, ${amount}, ${row.date ?? 'no date'}, filing: ${row.filing_id ?? 'N/A'}`,
      );
    }
    if (input.rows.length > 20) {
      parts.push(`  ... and ${input.rows.length - 20} more rows`);
    }
  } else if (input.nodes && input.edges) {
    parts.push(`\nGraph: ${input.nodes.length} nodes, ${input.edges.length} edges`);
    const topNodes = input.nodes.slice(0, 10);
    parts.push('Nodes:');
    for (const node of topNodes) {
      parts.push(`- ${node.name} (${node.label})`);
    }
  }

  return parts.join('\n');
}

// ============================================================
// SUMMARIZATION PIPELINE
// ============================================================

/**
 * Generate a neutral summary of query results.
 * Returns the summary text along with any guardrail violations.
 */
export async function summarizeResults(input: SummarizeInput): Promise<SummaryResult> {
  if (input.resultCount === 0) {
    return {
      summary: 'No matching records were found for the given criteria.',
      violations: [],
      passed: true,
    };
  }

  const userContent = formatResultsForPrompt(input);

  const messages: ChatMessage[] = [
    { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
    { role: 'user', content: `Summarize these query results:\n\n${userContent}` },
  ];

  const response = await chatCompletion(messages, {
    temperature: 0.2,
    max_tokens: 512,
  });

  const summary = response.content.trim();
  const violations = checkGuardrails(summary);
  const hasBlocks = violations.some((v) => v.severity === 'block');

  if (hasBlocks) {
    return {
      summary: 'Summary contained policy-violating content and was blocked. Raw data is available in the table view.',
      violations,
      passed: false,
    };
  }

  return { summary, violations, passed: true };
}

/**
 * Stream a summary of query results. Yields text chunks.
 * Does NOT apply guardrails mid-stream — caller should collect
 * full text and run checkGuardrails() after.
 */
export async function* summarizeResultsStream(
  input: SummarizeInput,
): AsyncGenerator<string, void, unknown> {
  if (input.resultCount === 0) {
    yield 'No matching records were found for the given criteria.';
    return;
  }

  const userContent = formatResultsForPrompt(input);

  const messages: ChatMessage[] = [
    { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
    { role: 'user', content: `Summarize these query results:\n\n${userContent}` },
  ];

  yield* chatCompletionStream(messages, {
    temperature: 0.2,
    max_tokens: 512,
  });
}
