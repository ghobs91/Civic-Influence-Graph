'use client';

import { useState } from 'react';
import type { FundingSummary as FundingSummaryData } from '@/lib/api-client';
import DrillDown from './DrillDown';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function FundingSummary({
  data,
  entityId,
}: {
  data: FundingSummaryData;
  entityId: string;
}) {
  const [drillDown, setDrillDown] = useState<{ direction: string } | null>(null);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card">
          <p style={{ color: 'var(--color-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Received
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            <button
              onClick={() => setDrillDown({ direction: 'received' })}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                fontSize: 'inherit',
                fontWeight: 'inherit',
                padding: 0,
                textDecoration: 'underline',
              }}
              aria-label="Drill down into received funding"
            >
              {formatCurrency(data.total_received)}
            </button>
          </p>
        </div>
        <div className="card">
          <p style={{ color: 'var(--color-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Given
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            <button
              onClick={() => setDrillDown({ direction: 'given' })}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                fontSize: 'inherit',
                fontWeight: 'inherit',
                padding: 0,
                textDecoration: 'underline',
              }}
              aria-label="Drill down into given funding"
            >
              {formatCurrency(data.total_given)}
            </button>
          </p>
        </div>
      </div>

      {data.by_sector && data.by_sector.length > 0 && (
        <section style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>By Sector</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Sector</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Amount</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.by_sector.map((s) => (
                <tr key={s.sector_id ?? s.sector} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem 0.25rem' }}>{s.sector}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem 0.25rem' }}>{formatCurrency(s.amount)}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem 0.25rem' }}>{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.top_counterparties.length > 0 && (
        <section>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Top Counterparties</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Type</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Amount</th>
                <th style={{ textAlign: 'right', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 500 }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {data.top_counterparties.map((cp) => (
                <tr key={cp.entity_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem 0.25rem' }}>
                    <a href={`/entities/${cp.entity_id}`}>{cp.name ?? cp.entity_id}</a>
                  </td>
                  <td style={{ padding: '0.5rem 0.25rem' }}>{cp.entity_type}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem 0.25rem' }}>{formatCurrency(cp.amount)}</td>
                  <td style={{ textAlign: 'right', padding: '0.5rem 0.25rem' }}>{cp.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {drillDown && (
        <DrillDown
          entityId={entityId}
          type="donations"
          params={{ direction: drillDown.direction }}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
