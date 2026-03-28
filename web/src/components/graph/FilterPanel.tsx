'use client';

import { useState } from 'react';

const EDGE_TYPE_OPTIONS = [
  { value: 'DONATED_TO', label: 'Donations' },
  { value: 'LOBBIED_FOR', label: 'Lobbying' },
  { value: 'VOTED_ON', label: 'Votes' },
  { value: 'SPONSORED', label: 'Sponsored' },
  { value: 'AFFILIATED_WITH', label: 'Affiliations' },
];

export interface FilterValues {
  start_date: string;
  end_date: string;
  sectors: string;
  min_amount: string;
  edge_types: string[];
  jurisdiction: string;
  max_nodes: string;
}

const INITIAL_FILTERS: FilterValues = {
  start_date: '',
  end_date: '',
  sectors: '',
  min_amount: '',
  edge_types: ['DONATED_TO'],
  jurisdiction: '',
  max_nodes: '100',
};

interface FilterPanelProps {
  onApply: (filters: FilterValues) => void;
  onReset: () => void;
  loading?: boolean;
}

export default function FilterPanel({ onApply, onReset, loading }: FilterPanelProps) {
  const [filters, setFilters] = useState<FilterValues>({ ...INITIAL_FILTERS });

  function handleEdgeTypeToggle(value: string) {
    setFilters((prev) => {
      const types = prev.edge_types.includes(value)
        ? prev.edge_types.filter((t) => t !== value)
        : [...prev.edge_types, value];
      return { ...prev, edge_types: types };
    });
  }

  function handleApply() {
    onApply(filters);
  }

  function handleReset() {
    setFilters({ ...INITIAL_FILTERS });
    onReset();
  }

  const inputStyle: React.CSSProperties = {
    padding: '0.375rem 0.5rem',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-card-bg)',
    color: 'var(--color-fg)',
    fontSize: '0.875rem',
    width: '100%',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-muted)',
    marginBottom: '0.25rem',
    display: 'block',
  };

  return (
    <form
      aria-label="Graph filters"
      onSubmit={(e) => {
        e.preventDefault();
        handleApply();
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: '0.75rem',
        padding: '1rem',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-card-bg)',
        marginBottom: '1rem',
      }}
    >
      <div>
        <label style={labelStyle}>
          Start Date
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters((p) => ({ ...p, start_date: e.target.value }))}
            style={inputStyle}
          />
        </label>
      </div>

      <div>
        <label style={labelStyle}>
          End Date
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters((p) => ({ ...p, end_date: e.target.value }))}
            style={inputStyle}
          />
        </label>
      </div>

      <div>
        <label style={labelStyle}>
          Sector
          <input
            type="text"
            value={filters.sectors}
            onChange={(e) => setFilters((p) => ({ ...p, sectors: e.target.value }))}
            placeholder="e.g. Defense"
            style={inputStyle}
          />
        </label>
      </div>

      <div>
        <label style={labelStyle}>
          Min Amount
          <input
            type="number"
            value={filters.min_amount}
            onChange={(e) => setFilters((p) => ({ ...p, min_amount: e.target.value }))}
            placeholder="0"
            min="0"
            style={inputStyle}
          />
        </label>
      </div>

      <div>
        <label style={labelStyle}>
          Jurisdiction
          <input
            type="text"
            value={filters.jurisdiction}
            onChange={(e) => setFilters((p) => ({ ...p, jurisdiction: e.target.value }))}
            placeholder="e.g. federal"
            style={inputStyle}
          />
        </label>
      </div>

      <div>
        <label style={labelStyle}>
          Max Nodes
          <input
            type="number"
            value={filters.max_nodes}
            onChange={(e) => setFilters((p) => ({ ...p, max_nodes: e.target.value }))}
            min="1"
            max="500"
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ gridColumn: '1 / -1' }}>
        <span style={labelStyle}>Edge Types</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
          {EDGE_TYPE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={filters.edge_types.includes(opt.value)}
                onChange={() => handleEdgeTypeToggle(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={handleReset}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-card-bg)',
            color: 'var(--color-fg)',
            fontSize: '0.875rem',
          }}
        >
          Reset
        </button>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)',
            color: '#fff',
            fontSize: '0.875rem',
            fontWeight: 600,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Loading...' : 'Apply Filters'}
        </button>
      </div>
    </form>
  );
}

export { INITIAL_FILTERS };
