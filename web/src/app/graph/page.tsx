'use client';

import { useState, useCallback } from 'react';
import FilterPanel, { type FilterValues } from '@/components/graph/FilterPanel';
import GraphView from '@/components/graph/GraphView';
import TableView from '@/components/graph/TableView';
import {
  queryGraph,
  queryTable,
  queryTableCsv,
  type GraphNode,
  type GraphEdge,
  type TableRow,
} from '@/lib/api-client';
import { exportCsv, exportJson, buildExportMeta, downloadFile, type ExportMetadata } from '@/lib/export';

type ViewMode = 'graph' | 'table';

export default function GraphPage() {
  const [view, setView] = useState<ViewMode>('graph');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Graph state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);

  // Table state
  const [rows, setRows] = useState<TableRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [lastFilters, setLastFilters] = useState<FilterValues | null>(null);
  const [lastMeta, setLastMeta] = useState<ExportMetadata | null>(null);

  const PAGE_SIZE = 50;

  const fetchData = useCallback(
    async (filters: FilterValues, pageNum: number) => {
      setLoading(true);
      setError(null);

      const params = {
        start_date: filters.start_date || undefined,
        end_date: filters.end_date || undefined,
        sectors: filters.sectors ? [filters.sectors] : undefined,
        min_amount: filters.min_amount ? Number(filters.min_amount) : undefined,
        edge_types: filters.edge_types.length > 0 ? filters.edge_types : undefined,
        jurisdiction: filters.jurisdiction || undefined,
        max_nodes: filters.max_nodes ? Number(filters.max_nodes) : undefined,
      };

      try {
        if (view === 'graph') {
          const res = await queryGraph(params);
          setNodes(res.data.nodes);
          setEdges(res.data.edges);
        } else {
          const res = await queryTable({
            start_date: params.start_date,
            end_date: params.end_date,
            sectors: params.sectors?.join(','),
            min_amount: params.min_amount,
            edge_types: params.edge_types?.join(','),
            jurisdiction: params.jurisdiction,
            page: pageNum,
            page_size: PAGE_SIZE,
          });
          setRows(res.data.rows);
          setTotalCount(res.meta.total_count);
          setLastMeta(
            buildExportMeta(res.meta, {
              start_date: params.start_date,
              end_date: params.end_date,
              sectors: params.sectors?.join(','),
              min_amount: params.min_amount,
              edge_types: params.edge_types?.join(','),
              jurisdiction: params.jurisdiction,
            }),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    },
    [view],
  );

  function handleApply(filters: FilterValues) {
    setLastFilters(filters);
    setPage(1);
    fetchData(filters, 1);
  }

  function handleReset() {
    setNodes([]);
    setEdges([]);
    setRows([]);
    setTotalCount(0);
    setPage(1);
    setLastFilters(null);
    setLastMeta(null);
    setError(null);
  }

  function handlePageChange(newPage: number) {
    setPage(newPage);
    if (lastFilters) {
      fetchData(lastFilters, newPage);
    }
  }

  async function handleExportCsv() {
    if (!lastFilters) return;
    try {
      const csv = await queryTableCsv({
        start_date: lastFilters.start_date || undefined,
        end_date: lastFilters.end_date || undefined,
        sectors: lastFilters.sectors || undefined,
        min_amount: lastFilters.min_amount ? Number(lastFilters.min_amount) : undefined,
        edge_types: lastFilters.edge_types.join(',') || undefined,
        jurisdiction: lastFilters.jurisdiction || undefined,
        page: 1,
        page_size: 1000,
      });
      downloadFile(csv, 'cig-export.csv', 'text/csv');
    } catch {
      setError('CSV export failed');
    }
  }

  function handleExportJson() {
    if (!lastMeta || rows.length === 0) return;
    const json = exportJson(rows, lastMeta);
    downloadFile(json, 'cig-export.json', 'application/json');
  }

  function handleExportLocalCsv() {
    if (!lastMeta || rows.length === 0) return;
    const csv = exportCsv(rows, lastMeta);
    downloadFile(csv, 'cig-export.csv', 'text/csv');
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 1.25rem',
    border: 'none',
    borderBottom: active ? '2px solid var(--color-primary)' : '2px solid transparent',
    background: 'none',
    color: active ? 'var(--color-primary)' : 'var(--color-muted)',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    fontSize: '0.9375rem',
  });

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Influence Graph Explorer</h1>

      <FilterPanel onApply={handleApply} onReset={handleReset} loading={loading} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div>
          <button style={tabStyle(view === 'graph')} onClick={() => setView('graph')}>
            Graph View
          </button>
          <button style={tabStyle(view === 'table')} onClick={() => setView('table')}>
            Table View
          </button>
        </div>

        {view === 'table' && rows.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleExportLocalCsv}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.8125rem',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-card-bg)',
                color: 'var(--color-fg)',
                cursor: 'pointer',
              }}
            >
              Export CSV
            </button>
            <button
              onClick={handleExportJson}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.8125rem',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-card-bg)',
                color: 'var(--color-fg)',
                cursor: 'pointer',
              }}
            >
              Export JSON
            </button>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: '0.75rem',
            marginBottom: '1rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {view === 'graph' ? (
        <GraphView nodes={nodes} edges={edges} />
      ) : (
        <TableView
          rows={rows}
          totalCount={totalCount}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
