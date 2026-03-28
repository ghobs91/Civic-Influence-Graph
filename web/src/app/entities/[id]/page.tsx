'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getEntity,
  getDashboard,
  type EntityDetail,
  type DashboardData,
} from '@/lib/api-client';
import FundingSummary from '@/components/dashboard/FundingSummary';
import LobbySummary from '@/components/dashboard/LobbySummary';
import VotingSummary from '@/components/dashboard/VotingSummary';

type Tab = 'funding' | 'lobbying' | 'votes';

function DateRangeFilter({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
        From:
        <input
          type="date"
          value={startDate}
          onChange={(e) => onChange(e.target.value, endDate)}
          style={{
            marginLeft: '0.25rem',
            padding: '0.375rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-card-bg)',
            color: 'var(--color-fg)',
          }}
        />
      </label>
      <label style={{ fontSize: '0.875rem', color: 'var(--color-muted)' }}>
        To:
        <input
          type="date"
          value={endDate}
          onChange={(e) => onChange(startDate, e.target.value)}
          style={{
            marginLeft: '0.25rem',
            padding: '0.375rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-card-bg)',
            color: 'var(--color-fg)',
          }}
        />
      </label>
    </div>
  );
}

const TAB_LABELS: Record<Tab, string> = {
  funding: 'Funding',
  lobbying: 'Lobbying',
  votes: 'Votes',
};

export default function EntityDashboardPage() {
  const params = useParams<{ id: string }>();
  const entityId = params.id;

  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('funding');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entityRes, dashRes] = await Promise.all([
        getEntity(entityId),
        getDashboard(entityId, {
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
      ]);
      setEntity(entityRes.data);
      setDashboard(dashRes.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load entity data');
    } finally {
      setLoading(false);
    }
  }, [entityId, startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-muted)' }}>Loading...</p>;
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: '1rem',
          background: 'rgba(220, 38, 38, 0.1)',
          border: '1px solid var(--color-error)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--color-error)',
          marginTop: '1rem',
        }}
      >
        {error}
      </div>
    );
  }

  if (!entity || !dashboard) return null;

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>{entity.canonical_name}</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem' }}>
          {entity.entity_type}
          {entity.party && <> &middot; {entity.party}</>}
          {entity.jurisdictions && entity.jurisdictions.length > 0 && (
            <> &middot; {entity.jurisdictions.join(', ')}</>
          )}
        </p>
      </header>

      <div style={{ marginBottom: '1.5rem' }}>
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onChange={(s, e) => {
            setStartDate(s);
            setEndDate(e);
          }}
        />
      </div>

      <nav
        role="tablist"
        aria-label="Dashboard sections"
        style={{
          display: 'flex',
          gap: '0.25rem',
          borderBottom: '2px solid var(--color-border)',
          marginBottom: '1.5rem',
        }}
      >
        {(Object.entries(TAB_LABELS) as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            aria-controls={`panel-${key}`}
            onClick={() => setActiveTab(key)}
            style={{
              padding: '0.625rem 1.25rem',
              border: 'none',
              borderBottom: activeTab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'transparent',
              color: activeTab === key ? 'var(--color-primary)' : 'var(--color-muted)',
              fontWeight: activeTab === key ? 600 : 400,
              marginBottom: '-2px',
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div id="panel-funding" role="tabpanel" hidden={activeTab !== 'funding'}>
        {activeTab === 'funding' && <FundingSummary data={dashboard.funding_summary} entityId={entityId} />}
      </div>

      <div id="panel-lobbying" role="tabpanel" hidden={activeTab !== 'lobbying'}>
        {activeTab === 'lobbying' && <LobbySummary data={dashboard.lobbying_summary} />}
      </div>

      <div id="panel-votes" role="tabpanel" hidden={activeTab !== 'votes'}>
        {activeTab === 'votes' && <VotingSummary data={dashboard.voting_summary} />}
      </div>
    </div>
  );
}
