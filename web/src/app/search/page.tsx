'use client';

import { useState, useCallback } from 'react';
import type { SearchResult, PaginationMeta } from '@/lib/api-client';
import { search as apiSearch } from '@/lib/api-client';

function entityTypeLabel(type: string): string {
  switch (type) {
    case 'person':
      return 'Person';
    case 'committee':
      return 'Committee';
    case 'organization':
      return 'Organization';
    default:
      return type;
  }
}

function ResultCard({ result }: { result: SearchResult }) {
  return (
    <a
      href={`/entities/${result.id}`}
      className="card"
      style={{ display: 'block', marginBottom: '0.75rem', textDecoration: 'none', color: 'inherit' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: '1.1rem' }}>{result.canonical_name}</strong>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.5rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-muted)',
          }}
        >
          {entityTypeLabel(result.entity_type)}
        </span>
      </div>
      {(result.jurisdiction || result.party) && (
        <div style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          {result.jurisdiction && <span>{result.jurisdiction}</span>}
          {result.jurisdiction && result.party && <span> &middot; </span>}
          {result.party && <span>{result.party}</span>}
        </div>
      )}
    </a>
  );
}

function Pagination({
  meta,
  onPage,
}: {
  meta: PaginationMeta;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.ceil(meta.total_count / meta.page_size);
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Search results pagination"
      style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}
    >
      <button
        disabled={meta.page <= 1}
        onClick={() => onPage(meta.page - 1)}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-card-bg)',
          color: 'var(--color-fg)',
          opacity: meta.page <= 1 ? 0.5 : 1,
        }}
      >
        Previous
      </button>
      <span style={{ padding: '0.5rem', color: 'var(--color-muted)', fontSize: '0.875rem' }}>
        Page {meta.page} of {totalPages}
      </span>
      <button
        disabled={meta.page >= totalPages}
        onClick={() => onPage(meta.page + 1)}
        style={{
          padding: '0.5rem 1rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-card-bg)',
          color: 'var(--color-fg)',
          opacity: meta.page >= totalPages ? 0.5 : 1,
        }}
      >
        Next
      </button>
    </nav>
  );
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(
    async (page = 1) => {
      if (!query.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const res = await apiSearch({
          q: query.trim(),
          type: typeFilter || undefined,
          page,
        });
        setResults(res.data.results);
        setMeta(res.meta);
        setSearched(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
        setResults([]);
        setMeta(null);
      } finally {
        setLoading(false);
      }
    },
    [query, typeFilter],
  );

  return (
    <div style={{ maxWidth: '720px', marginInline: 'auto' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Search</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          doSearch(1);
        }}
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}
      >
        <input
          type="search"
          placeholder="Search entities..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            padding: '0.625rem 0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-card-bg)',
            color: 'var(--color-fg)',
          }}
          aria-label="Search query"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '0.625rem 0.5rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-card-bg)',
            color: 'var(--color-fg)',
          }}
          aria-label="Entity type filter"
        >
          <option value="">All types</option>
          <option value="person">Person</option>
          <option value="committee">Committee</option>
          <option value="organization">Organization</option>
        </select>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: '0.625rem 1.25rem',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: 600,
            opacity: loading || !query.trim() ? 0.6 : 1,
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-error)',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {meta && (
        <p style={{ color: 'var(--color-muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          {meta.total_count} result{meta.total_count !== 1 ? 's' : ''} found
        </p>
      )}

      <div role="list" aria-label="Search results">
        {results.map((r) => (
          <div key={r.id} role="listitem">
            <ResultCard result={r} />
          </div>
        ))}
      </div>

      {searched && results.length === 0 && !loading && !error && (
        <p style={{ textAlign: 'center', color: 'var(--color-muted)', padding: '2rem 0' }}>
          No results found.
        </p>
      )}

      {meta && <Pagination meta={meta} onPage={doSearch} />}
    </div>
  );
}
