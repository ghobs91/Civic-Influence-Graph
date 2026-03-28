'use client';

import type { VotingSummary as VotingSummaryData } from '@/lib/api-client';

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

function voteBadge(cast: string) {
  const colors: Record<string, string> = {
    yea: 'var(--color-success)',
    nay: 'var(--color-error)',
  };
  const color = colors[cast] ?? 'var(--color-muted)';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.125rem 0.5rem',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${color}`,
        color,
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'uppercase',
      }}
    >
      {cast}
    </span>
  );
}

export default function VotingSummary({ data }: { data: VotingSummaryData }) {
  const totalCast = (data.yea_votes ?? 0) + (data.nay_votes ?? 0);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <p style={{ color: 'var(--color-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Votes
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.total_votes}</p>
        </div>
        <div className="card">
          <p style={{ color: 'var(--color-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Yea
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-success)' }}>
            {data.yea_votes ?? 0}
          </p>
        </div>
        <div className="card">
          <p style={{ color: 'var(--color-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Nay
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-error)' }}>
            {data.nay_votes ?? 0}
          </p>
        </div>
      </div>

      {totalCast > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            Yea / Nay Ratio
          </p>
          <div
            style={{
              display: 'flex',
              height: '0.5rem',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              background: 'var(--color-border)',
            }}
            role="img"
            aria-label={`${data.yea_votes ?? 0} yea votes, ${data.nay_votes ?? 0} nay votes`}
          >
            <div
              style={{
                width: `${((data.yea_votes ?? 0) / totalCast) * 100}%`,
                background: 'var(--color-success)',
              }}
            />
            <div
              style={{
                width: `${((data.nay_votes ?? 0) / totalCast) * 100}%`,
                background: 'var(--color-error)',
              }}
            />
          </div>
        </div>
      )}

      {data.recent_votes.length > 0 && (
        <section>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Recent Votes</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Bill</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Vote</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_votes.map((v) => (
                <tr key={`${v.bill_id}-${v.vote_date}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem 0.25rem' }}>
                    {v.bill_number}
                  </td>
                  <td style={{ padding: '0.5rem 0.25rem' }}>{voteBadge(v.vote_cast)}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem 0.25rem' }}>{formatDate(v.vote_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
