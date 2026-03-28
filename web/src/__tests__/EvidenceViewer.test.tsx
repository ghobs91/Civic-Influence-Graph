// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EvidenceViewer from '../components/ai/EvidenceViewer';
import type { TableRow, GraphNode, GraphEdge } from '../lib/api-client';

// Mock @mlc-ai/web-llm to prevent ESM issues from transitive imports
vi.mock('@mlc-ai/web-llm', () => ({
  MLCEngine: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

const ROW: TableRow = {
  source_id: 's1',
  source_name: 'Alice Smith',
  source_type: 'Person',
  target_id: 't1',
  target_name: 'PAC Fund',
  target_type: 'Committee',
  edge_type: 'DONATED_TO',
  amount: 5000,
  date: '2025-03-15',
  filing_id: 'F12345',
};

describe('EvidenceViewer', () => {
  it('renders the record count', () => {
    render(<EvidenceViewer resultCount={42} />);
    expect(screen.getByText(/42 records/)).toBeTruthy();
  });

  it('renders empty state for zero results', () => {
    render(<EvidenceViewer resultCount={0} />);
    expect(screen.getByText(/No matching records/)).toBeTruthy();
  });

  it('renders table rows with source and target names', () => {
    render(<EvidenceViewer rows={[ROW]} resultCount={1} />);
    expect(screen.getByText('Alice Smith')).toBeTruthy();
    expect(screen.getByText('PAC Fund')).toBeTruthy();
    expect(screen.getByText('DONATED_TO')).toBeTruthy();
  });

  it('formats amounts with dollar sign', () => {
    render(<EvidenceViewer rows={[ROW]} resultCount={1} />);
    expect(screen.getByText('$5,000')).toBeTruthy();
  });

  it('renders filing ID as external link', () => {
    render(<EvidenceViewer rows={[ROW]} resultCount={1} />);
    const link = screen.getByText('F12345') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.href).toContain('fec.gov');
    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('shows time window when provided', () => {
    render(
      <EvidenceViewer
        resultCount={5}
        timeWindow={{ start: '2025-01-01', end: '2025-12-31' }}
      />,
    );
    expect(screen.getByText(/2025-01-01/)).toBeTruthy();
    expect(screen.getByText(/2025-12-31/)).toBeTruthy();
  });

  it('shows graph summary for node/edge data', () => {
    const nodes: GraphNode[] = [
      { id: 'n1', label: 'Person', name: 'Bob', properties: {} },
      { id: 'n2', label: 'Committee', name: 'PAC-A', properties: {} },
    ];
    const edges: GraphEdge[] = [
      { id: 'e1', source: 'n1', target: 'n2', label: 'DONATED_TO', properties: {} },
    ];
    render(<EvidenceViewer nodes={nodes} edges={edges} resultCount={2} />);
    expect(screen.getByText(/2 nodes, 1 edges/)).toBeTruthy();
    expect(screen.getByText(/Bob/)).toBeTruthy();
    expect(screen.getByText(/PAC-A/)).toBeTruthy();
  });

  it('shows cypher in query details', () => {
    render(
      <EvidenceViewer
        resultCount={1}
        cypher="MATCH (n:Person) RETURN n LIMIT 10"
        rows={[ROW]}
      />,
    );
    expect(screen.getByText('Query Details')).toBeTruthy();
  });
});
