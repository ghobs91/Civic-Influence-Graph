'use client';

import type { TableRow, GraphNode, GraphEdge } from '@/lib/api-client';

export interface EvidenceViewerProps {
  rows?: TableRow[];
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  cypher?: string;
  parameters?: Record<string, unknown>;
  resultCount: number;
  timeWindow?: { start: string; end: string };
}

function formatAmount(amount: number | null): string {
  if (amount == null) return '—';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return date;
  }
}

export default function EvidenceViewer({
  rows,
  nodes,
  edges,
  cypher,
  parameters,
  resultCount,
  timeWindow,
}: EvidenceViewerProps) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: '0.5rem',
        overflow: 'hidden',
      }}
    >
      {/* Header with counts */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          background: '#f9fafb',
          borderBottom: '1px solid var(--color-border, #e5e7eb)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
          Evidence ({resultCount} records)
        </h3>
        {timeWindow && (
          <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            {timeWindow.start} — {timeWindow.end}
          </span>
        )}
      </div>

      {/* Query details (collapsible) */}
      {cypher && (
        <details style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
          <summary
            style={{
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: '#6b7280',
            }}
          >
            Query Details
          </summary>
          <div style={{ padding: '0 1rem 0.5rem' }}>
            <pre
              data-testid="evidence-cypher"
              style={{
                background: '#1f2937',
                color: '#e5e7eb',
                padding: '0.5rem',
                borderRadius: '0.375rem',
                fontSize: '0.75rem',
                overflow: 'auto',
                margin: '0 0 0.5rem',
              }}
            >
              {cypher}
            </pre>
            {parameters && Object.keys(parameters).length > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                <strong>Parameters:</strong>{' '}
                {Object.entries(parameters).map(([k, v]) => (
                  <span key={k} style={{ marginRight: '0.75rem' }}>
                    {k}={String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      )}

      {/* Data table for rows */}
      {rows && rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table
            data-testid="evidence-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
            }}
          >
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Source</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Relationship</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Target</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Amount</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Date</th>
                <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Filing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr
                  key={`${row.source_id}-${row.target_id}-${idx}`}
                  style={{
                    borderTop: '1px solid var(--color-border, #e5e7eb)',
                  }}
                >
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ fontWeight: 500 }}>{row.source_name}</span>
                    <br />
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {row.source_type}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{row.edge_type}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    <span style={{ fontWeight: 500 }}>{row.target_name}</span>
                    <br />
                    <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                      {row.target_type}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{formatAmount(row.amount)}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{formatDate(row.date)}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>
                    {row.filing_id ? (
                      <a
                        href={`https://www.fec.gov/data/receipts/?sub_id=${encodeURIComponent(row.filing_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6' }}
                      >
                        {row.filing_id}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Graph summary for node/edge data */}
      {!rows?.length && nodes && edges && (
        <div style={{ padding: '1rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
            {nodes.length} nodes, {edges.length} edges
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {nodes.slice(0, 20).map((node) => (
              <span
                key={node.id}
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  background: '#e5e7eb',
                }}
              >
                {node.name} ({node.label})
              </span>
            ))}
            {nodes.length > 20 && (
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', alignSelf: 'center' }}>
                …and {nodes.length - 20} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {resultCount === 0 && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
          No matching records found.
        </div>
      )}
    </div>
  );
}
