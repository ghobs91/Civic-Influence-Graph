import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GraphPage from '../app/graph/page.js';

// Mock cytoscape
vi.mock('cytoscape', () => {
  const mockCy = { on: vi.fn(), destroy: vi.fn() };
  return { default: vi.fn(() => mockCy) };
});

// Mock api-client
vi.mock('../lib/api-client.js', () => ({
  queryGraph: vi.fn(),
  queryTable: vi.fn(),
  queryTableCsv: vi.fn(),
  ApiClientError: class extends Error {
    status: number;
    body: unknown;
    constructor(s: number, b: unknown) {
      super('error');
      this.status = s;
      this.body = b;
    }
  },
}));

// Mock export utilities
vi.mock('../lib/export.js', () => ({
  exportCsv: vi.fn(() => 'csv-content'),
  exportJson: vi.fn(() => '{"data":[]}'),
  buildExportMeta: vi.fn(() => ({
    export_date: '2025-01-01T00:00:00Z',
    data_snapshot: null,
    filters: {},
    total_records: 1,
  })),
  downloadFile: vi.fn(),
}));

import { queryGraph, queryTable } from '../lib/api-client.js';
const mockQueryGraph = queryGraph as ReturnType<typeof vi.fn>;
const mockQueryTable = queryTable as ReturnType<typeof vi.fn>;

const graphResponse = {
  data: {
    nodes: [
      { id: 'n1', label: 'Person', name: 'Jane Doe', properties: {} },
      { id: 'n2', label: 'Committee', name: 'PAC Fund', properties: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2', label: 'DONATED_TO', properties: { amount: 5000 } },
    ],
  },
  meta: {
    request_id: '1',
    timestamp: '2025-01-01T00:00:00Z',
    data_snapshot: null,
    total_count: 2,
    page: 1,
    page_size: 50,
  },
};

const tableResponse = {
  data: {
    rows: [
      {
        source_id: 's1',
        source_name: 'Jane Doe',
        source_type: 'Person',
        target_id: 't1',
        target_name: 'PAC Fund',
        target_type: 'Committee',
        edge_type: 'DONATED_TO',
        amount: 5000,
        date: '2024-06-01',
        filing_id: 'F001',
      },
    ],
  },
  meta: {
    request_id: '2',
    timestamp: '2025-01-01T00:00:00Z',
    data_snapshot: null,
    total_count: 1,
    page: 1,
    page_size: 50,
  },
};

beforeEach(() => {
  mockQueryGraph.mockReset();
  mockQueryTable.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GraphPage', () => {
  // @vitest-environment jsdom

  it('renders page heading and filter panel', () => {
    render(<GraphPage />);
    expect(screen.getByText('Influence Graph Explorer')).toBeDefined();
    expect(screen.getByRole('form', { name: /Graph filters/ })).toBeDefined();
  });

  it('defaults to graph view tab', () => {
    render(<GraphPage />);
    expect(screen.getByText('Graph View')).toBeDefined();
    expect(screen.getByText('Table View')).toBeDefined();
    // The Graph View tab should appear active (has color-primary)
    const graphTab = screen.getByText('Graph View');
    expect(graphTab.style.fontWeight).toBe('600');
  });

  it('fetches graph data on apply filters', async () => {
    mockQueryGraph.mockResolvedValue(graphResponse);
    render(<GraphPage />);

    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

    await waitFor(() => {
      expect(mockQueryGraph).toHaveBeenCalledTimes(1);
    });
  });

  it('switches to table view and fetches table data', async () => {
    mockQueryTable.mockResolvedValue(tableResponse);
    render(<GraphPage />);

    // Switch to table view
    fireEvent.click(screen.getByText('Table View'));
    // Apply filters
    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

    await waitFor(() => {
      expect(mockQueryTable).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Jane Doe')).toBeDefined();
    expect(screen.getByText('PAC Fund')).toBeDefined();
  });

  it('displays error on fetch failure', async () => {
    mockQueryGraph.mockRejectedValue(new Error('Network error'));
    render(<GraphPage />);

    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
    expect(screen.getByText('Network error')).toBeDefined();
  });

  it('resets state on reset button click', async () => {
    mockQueryGraph.mockResolvedValue(graphResponse);
    render(<GraphPage />);

    fireEvent.click(screen.getByRole('button', { name: /Apply Filters/i }));
    await waitFor(() => expect(mockQueryGraph).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    // After reset, graph empty state should show
    expect(screen.getByText(/No graph data/)).toBeDefined();
  });
});
