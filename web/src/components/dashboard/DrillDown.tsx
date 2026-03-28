'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getDonations,
  getLobbying,
  getVotes,
  type Donation,
  type LobbyingEngagement,
  type Vote,
  type PaginationMeta,
} from '@/lib/api-client';

type DrillDownType = 'donations' | 'lobbying' | 'votes';

interface DrillDownProps {
  entityId: string;
  type: DrillDownType;
  params?: Record<string, string | number | undefined>;
  onClose: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function DonationsTable({ records }: { records: Donation[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>From</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>To</th>
          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Amount</th>
          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Date</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Filing ID</th>
        </tr>
      </thead>
      <tbody>
        {records.map((d) => (
          <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td style={{ padding: '0.5rem' }}>{d.source_entity_id.slice(0, 8)}...</td>
            <td style={{ padding: '0.5rem' }}>{d.destination_entity_id.slice(0, 8)}...</td>
            <td style={{ textAlign: 'right', padding: '0.5rem' }}>{formatCurrency(d.amount)}</td>
            <td style={{ textAlign: 'right', padding: '0.5rem' }}>{formatDate(d.transaction_date)}</td>
            <td style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--color-muted)' }}>{d.filing_id}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LobbyingTable({ records }: { records: LobbyingEngagement[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Filing Type</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Issues</th>
          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Amount</th>
          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Date</th>
        </tr>
      </thead>
      <tbody>
        {records.map((l) => (
          <tr key={l.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td style={{ padding: '0.5rem' }}>{l.filing_type}</td>
            <td style={{ padding: '0.5rem' }}>{l.issues.join(', ')}</td>
            <td style={{ textAlign: 'right', padding: '0.5rem' }}>{formatCurrency(l.amount)}</td>
            <td style={{ textAlign: 'right', padding: '0.5rem' }}>{formatDate(l.filing_date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VotesTable({ records }: { records: Vote[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Bill</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Title</th>
          <th style={{ textAlign: 'left', padding: '0.5rem' }}>Vote</th>
          <th style={{ textAlign: 'right', padding: '0.5rem' }}>Date</th>
        </tr>
      </thead>
      <tbody>
        {records.map((v) => (
          <tr key={v.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td style={{ padding: '0.5rem' }}>{v.bill_number}</td>
            <td style={{ padding: '0.5rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.bill_title}
            </td>
            <td style={{ padding: '0.5rem', textTransform: 'uppercase', fontWeight: 600, fontSize: '0.75rem' }}>
              {v.vote_cast}
            </td>
            <td style={{ textAlign: 'right', padding: '0.5rem' }}>{formatDate(v.vote_date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DrillDown({ entityId, type, params, onClose }: DrillDownProps) {
  const [records, setRecords] = useState<unknown[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const loadPage = useCallback(
    async (p: number) => {
      setLoading(true);
      setError(null);
      try {
        const queryParams = { ...params, page: p, page_size: 20 };
        if (type === 'donations') {
          const res = await getDonations(entityId, queryParams);
          setRecords(res.data.donations);
          setMeta(res.meta);
        } else if (type === 'lobbying') {
          const res = await getLobbying(entityId, queryParams);
          setRecords(res.data.lobbying_engagements);
          setMeta(res.meta);
        } else {
          const res = await getVotes(entityId, queryParams);
          setRecords(res.data.votes);
          setMeta(res.meta);
        }
        setPage(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load records');
      } finally {
        setLoading(false);
      }
    },
    [entityId, type, params],
  );

  useEffect(() => {
    loadPage(1);
  }, [loadPage]);

  const totalPages = meta ? Math.ceil(meta.total_count / meta.page_size) : 0;
  const title = type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <div
      role="dialog"
      aria-label={`${title} details`}
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          width: '90vw',
          maxWidth: '900px',
          maxHeight: '80vh',
          overflow: 'auto',
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              color: 'var(--color-muted)',
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {error && (
          <div role="alert" style={{ padding: '0.75rem', color: 'var(--color-error)', marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem' }}>Loading...</p>
        ) : records.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem' }}>No records found.</p>
        ) : (
          <>
            {type === 'donations' && <DonationsTable records={records as Donation[]} />}
            {type === 'lobbying' && <LobbyingTable records={records as LobbyingEngagement[]} />}
            {type === 'votes' && <VotesTable records={records as Vote[]} />}
          </>
        )}

        {meta && totalPages > 1 && (
          <nav
            aria-label="Drill-down pagination"
            style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}
          >
            <button
              disabled={page <= 1}
              onClick={() => loadPage(page - 1)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-card-bg)',
                color: 'var(--color-fg)',
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              Previous
            </button>
            <span style={{ padding: '0.5rem', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => loadPage(page + 1)}
              style={{
                padding: '0.5rem 1rem',
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

        {meta && (
          <p style={{ textAlign: 'center', color: 'var(--color-muted)', fontSize: '0.75rem', marginTop: '0.5rem' }}>
            {meta.total_count} total records
          </p>
        )}
      </div>
    </div>
  );
}
