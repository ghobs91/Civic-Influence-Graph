'use client';

import type { LobbySummary as LobbySummaryData } from '@/lib/api-client';

export default function LobbySummary({ data }: { data?: LobbySummaryData }) {
  if (!data) {
    return <p style={{ color: 'var(--color-muted)' }}>No lobbying data available.</p>;
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Engagements Mentioning
        </p>
        <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.engagements_mentioning}</p>
      </div>

      {data.top_clients.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Top Clients</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Client</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Engagements</th>
              </tr>
            </thead>
            <tbody>
              {data.top_clients.map((c) => (
                <tr key={c.org_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem 0.25rem' }}>{c.name}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem 0.25rem' }}>{c.engagement_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.top_issues.length > 0 && (
        <section>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Top Issues</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {data.top_issues.map((issue) => (
              <span
                key={issue}
                style={{
                  padding: '0.25rem 0.75rem',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.875rem',
                  color: 'var(--color-fg)',
                }}
              >
                {issue}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
