'use client';

import { useEffect, useState } from 'react';
import { getLeaderboard, type LeaderboardEntry, type LeaderboardParams } from '@/lib/api-client';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'committee', label: 'Committees' },
  { value: 'person', label: 'Individuals' },
  { value: 'organization', label: 'Organizations' },
] as const;

const COMMITTEE_TYPE_OPTIONS = [
  { value: '', label: 'All committees' },
  { value: 'pac', label: 'PAC' },
  { value: 'super_pac', label: 'Super PAC' },
  { value: 'party', label: 'Party' },
  { value: 'candidate', label: 'Candidate' },
  { value: 'joint_fundraising', label: 'Joint Fundraising' },
] as const;

const CYCLE_OPTIONS = [
  { value: '', label: 'All cycles' },
  { value: '2026', label: '2026' },
  { value: '2024', label: '2024' },
  { value: '2022', label: '2022' },
  { value: '2020', label: '2020' },
] as const;

function entityTypeLabel(entityType: string, committeeType: string | null): string {
  if (entityType === 'committee' && committeeType) {
    return committeeType.replace(/_/g, ' ');
  }
  return entityType;
}

export default function DonationLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entityType, setEntityType] = useState('');
  const [committeeType, setCommitteeType] = useState('');
  const [electionCycle, setElectionCycle] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params: LeaderboardParams = { limit: 25 };
    if (entityType) params.entity_type = entityType;
    if (committeeType) params.committee_type = committeeType;
    if (electionCycle) params.election_cycle = electionCycle;

    getLeaderboard(params)
      .then((res) => {
        if (!cancelled) setEntries(res.data.entries);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? 'Failed to load leaderboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entityType, committeeType, electionCycle]);

  const selectStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.8125rem',
    background: 'var(--color-bg, #fff)',
    color: 'var(--color-fg, #111)',
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
          Top Donors
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              if (e.target.value !== 'committee') setCommitteeType('');
            }}
            aria-label="Filter by entity type"
            style={selectStyle}
          >
            {ENTITY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          {entityType === 'committee' && (
            <select
              value={committeeType}
              onChange={(e) => setCommitteeType(e.target.value)}
              aria-label="Filter by committee type"
              style={selectStyle}
            >
              {COMMITTEE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}

          <select
            value={electionCycle}
            onChange={(e) => setElectionCycle(e.target.value)}
            aria-label="Filter by election cycle"
            style={selectStyle}
          >
            {CYCLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>Loading leaderboard…</p>
      )}

      {error && (
        <p style={{ color: '#c53030', fontSize: '0.875rem' }}>Error: {error}</p>
      )}

      {!loading && !error && entries.length === 0 && (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>No donation data found for the selected filters.</p>
      )}

      {!loading && !error && entries.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 600, width: '2rem' }}>#</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 600 }}>Name</th>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 600 }}>Type</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 600 }}>Total Donated</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0.25rem', color: 'var(--color-muted)', fontWeight: 600 }}>Donations</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.entity_id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.5rem 0.25rem', color: 'var(--color-muted)' }}>{i + 1}</td>
                <td style={{ padding: '0.5rem 0.25rem' }}>
                  <a href={`/entities/${entry.entity_id}`} style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                    {entry.name}
                  </a>
                </td>
                <td style={{ padding: '0.5rem 0.25rem', textTransform: 'capitalize' }}>
                  {entityTypeLabel(entry.entity_type, entry.committee_type)}
                </td>
                <td style={{ textAlign: 'right', padding: '0.5rem 0.25rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(entry.total_amount)}
                </td>
                <td style={{ textAlign: 'right', padding: '0.5rem 0.25rem', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCount(entry.donation_count)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
