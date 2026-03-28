'use client';

import { useState } from 'react';
import type { TableRow } from '@/lib/api-client';

type SortKey = keyof TableRow;
type SortDir = 'asc' | 'desc';

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
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

const COLUMNS: Array<{ key: SortKey; label: string; align?: 'right' }> = [
  { key: 'source_name', label: 'Source' },
  { key: 'source_type', label: 'Type' },
  { key: 'target_name', label: 'Target' },
  { key: 'target_type', label: 'Type' },
  { key: 'edge_type', label: 'Relationship' },
  { key: 'amount', label: 'Amount', align: 'right' },
  { key: 'date', label: 'Date', align: 'right' },
  { key: 'filing_id', label: 'Filing ID' },
];

interface TableViewProps {
  rows: TableRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function TableView({ rows, totalCount, page, pageSize, onPageChange }: TableViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('amount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedRows = [...rows].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const comp = String(aVal).localeCompare(String(bVal));
    return sortDir === 'asc' ? comp : -comp;
  });

  const totalPages = Math.ceil(totalCount / pageSize);

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-muted)' }}>
        No results. Try adjusting filters.
      </div>
    );
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
          aria-label="Graph edges table"
        >
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              {COLUMNS.map((col) => (
                <th
                  key={`${col.key}-${col.label}`}
                  onClick={() => handleSort(col.key)}
                  style={{
                    textAlign: col.align ?? 'left',
                    padding: '0.625rem 0.5rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-muted)',
                  }}
                  aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span style={{ marginLeft: '0.25rem' }}>
                      {sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr
                key={`${row.source_id}-${row.target_id}-${row.edge_type}-${idx}`}
                style={{ borderBottom: '1px solid var(--color-border)' }}
              >
                <td style={{ padding: '0.5rem' }}>{row.source_name}</td>
                <td style={{ padding: '0.5rem', color: 'var(--color-muted)', fontSize: '0.75rem' }}>{row.source_type}</td>
                <td style={{ padding: '0.5rem' }}>{row.target_name}</td>
                <td style={{ padding: '0.5rem', color: 'var(--color-muted)', fontSize: '0.75rem' }}>{row.target_type}</td>
                <td style={{ padding: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      padding: '0.125rem 0.375rem',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    {row.edge_type}
                  </span>
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatAmount(row.amount)}
                </td>
                <td style={{ padding: '0.5rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {formatDate(row.date)}
                </td>
                <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                  {row.filing_id ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <nav
          aria-label="Table pagination"
          style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}
        >
          <button
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            style={{
              padding: '0.375rem 0.75rem',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-card-bg)',
              color: 'var(--color-fg)',
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            style={{
              padding: '0.375rem 0.75rem',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-card-bg)',
              color: 'var(--color-fg)',
              opacity: page >= totalPages ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </nav>
      )}

      <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.5rem' }}>
        {totalCount} total records
      </p>
    </div>
  );
}
