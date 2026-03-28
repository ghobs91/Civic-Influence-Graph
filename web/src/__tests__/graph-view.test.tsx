import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Cytoscape doesn't work in jsdom — mock it
vi.mock('cytoscape', () => {
  const mockCy = {
    on: vi.fn(),
    destroy: vi.fn(),
  };
  return { default: vi.fn(() => mockCy) };
});

import GraphView from '../components/graph/GraphView.js';
import type { GraphNode, GraphEdge } from '../lib/api-client.js';

afterEach(() => {
  cleanup();
});

const sampleNodes: GraphNode[] = [
  { id: 'n1', label: 'Person', name: 'Jane Doe', properties: {} },
  { id: 'n2', label: 'Committee', name: 'PAC Fund', properties: {} },
  { id: 'n3', label: 'Organization', name: 'Corp Inc', properties: {} },
];

const sampleEdges: GraphEdge[] = [
  { id: 'e1', source: 'n1', target: 'n2', label: 'DONATED_TO', properties: { amount: 5000 } },
  { id: 'e2', source: 'n3', target: 'n2', label: 'LOBBIED_FOR', properties: { amount: 10000 } },
];

describe('GraphView', () => {
  // @vitest-environment jsdom

  it('shows empty state when no nodes', () => {
    render(<GraphView nodes={[]} edges={[]} />);
    expect(screen.getByText(/No graph data/)).toBeDefined();
  });

  it('renders graph container with aria-label', () => {
    render(<GraphView nodes={sampleNodes} edges={sampleEdges} />);
    expect(screen.getByRole('img')).toBeDefined();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Network graph with 3 nodes and 2 edges',
    );
  });

  it('renders legend with node type colors', () => {
    render(<GraphView nodes={sampleNodes} edges={sampleEdges} />);
    expect(screen.getByLabelText(/Graph legend/)).toBeDefined();
    expect(screen.getByText('Person')).toBeDefined();
    expect(screen.getByText('Committee')).toBeDefined();
    expect(screen.getByText('Organization')).toBeDefined();
    expect(screen.getByText('Bill')).toBeDefined();
    expect(screen.getByText('Sector')).toBeDefined();
  });

  it('initializes cytoscape with elements', async () => {
    const cytoscape = (await import('cytoscape')).default as unknown as ReturnType<typeof vi.fn>;
    cytoscape.mockClear();

    render(<GraphView nodes={sampleNodes} edges={sampleEdges} />);

    expect(cytoscape).toHaveBeenCalledTimes(1);
    const call = cytoscape.mock.calls[0][0];
    // 3 nodes + 2 edges = 5 elements
    expect(call.elements).toHaveLength(5);
  });
});
