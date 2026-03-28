'use client';

import { useEffect, useRef, useCallback } from 'react';
import cytoscape from 'cytoscape';
import type { GraphNode, GraphEdge } from '@/lib/api-client';

// Node colors by label
const NODE_COLORS: Record<string, string> = {
  Person: '#3b82f6',       // blue
  Committee: '#f59e0b',    // amber
  Organization: '#10b981', // green
  Bill: '#8b5cf6',         // purple
  Sector: '#6b7280',       // gray
};

function nodeColor(label: string): string {
  return NODE_COLORS[label] ?? '#9ca3af';
}

interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (nodeId: string) => void;
}

export default function GraphView({ nodes, edges, onNodeClick }: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const initGraph = useCallback(() => {
    if (!containerRef.current) return;

    // Destroy previous instance
    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const elements: cytoscape.ElementDefinition[] = [];

    for (const node of nodes) {
      elements.push({
        data: {
          id: node.id,
          label: node.name || node.id.slice(0, 8),
          nodeLabel: node.label,
          ...node.properties,
        },
      });
    }

    // Compute max amount for edge weight scaling
    const amounts = edges
      .map((e) => (e.properties.amount != null ? Math.abs(Number(e.properties.amount)) : 0))
      .filter((a) => a > 0);
    const maxAmount = amounts.length > 0 ? Math.max(...amounts) : 1;

    for (const edge of edges) {
      const amount = edge.properties.amount != null ? Math.abs(Number(edge.properties.amount)) : 0;
      const weight = amount > 0 ? 1 + (amount / maxAmount) * 5 : 1;
      elements.push({
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label,
          weight,
          amount: edge.properties.amount,
          ...edge.properties,
        },
      });
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': (ele: cytoscape.NodeSingular) => nodeColor(ele.data('nodeLabel')),
            color: 'var(--color-fg)',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            width: 30,
            height: 30,
          } as cytoscape.Css.Node,
        },
        {
          selector: 'edge',
          style: {
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            width: 'data(weight)',
            opacity: 0.7,
          } as cytoscape.Css.Edge,
        },
        {
          selector: 'node:active',
          style: {
            'overlay-opacity': 0.2,
          } as cytoscape.Css.Node,
        },
      ],
      layout: {
        name: 'cose',
        animate: false,
        nodeDimensionsIncludeLabels: true,
      },
      minZoom: 0.2,
      maxZoom: 5,
    });

    // Tooltip on hover
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      node.style('border-width', 3);
      node.style('border-color', '#fff');
    });

    cy.on('mouseout', 'node', (evt) => {
      const node = evt.target;
      node.style('border-width', 0);
    });

    // Click handler
    if (onNodeClick) {
      cy.on('tap', 'node', (evt) => {
        onNodeClick(evt.target.id());
      });
    }

    cyRef.current = cy;
  }, [nodes, edges, onNodeClick]);

  useEffect(() => {
    initGraph();

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [initGraph]);

  if (nodes.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-muted)' }}>
        No graph data. Try adjusting filters.
      </div>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div
        aria-label="Graph legend"
        style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}
      >
        {Object.entries(NODE_COLORS).map(([label, color]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span
              style={{ width: 12, height: 12, borderRadius: '50%', background: color, display: 'inline-block' }}
            />
            {label}
          </span>
        ))}
      </div>

      <div
        ref={containerRef}
        role="img"
        aria-label={`Network graph with ${nodes.length} nodes and ${edges.length} edges`}
        style={{
          width: '100%',
          height: '500px',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg)',
        }}
      />
    </div>
  );
}
