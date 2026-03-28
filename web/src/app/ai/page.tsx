'use client';

import { useState, useCallback, useRef } from 'react';
import ChatPanel, { type ChatMessage } from '@/components/ai/ChatPanel';
import EvidenceViewer from '@/components/ai/EvidenceViewer';
import GraphView from '@/components/graph/GraphView';
import { initEngine, destroyEngine, chatCompletionStream, getModelId, isWebGPUAvailable } from '@/lib/webllm';
import { generateQuery } from '@/lib/ai-pipeline';
import { summarizeResults } from '@/lib/ai-summarize';
import { saveAuditEntry, toServerPayload } from '@/lib/audit-log';
import { queryGraph, postAuditLog, type GraphNode, type GraphEdge, type TableRow } from '@/lib/api-client';

type ModelStatus = 'not-loaded' | 'loading' | 'ready' | 'error';

export default function AIQueryPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('not-loaded');
  const [modelProgress, setModelProgress] = useState(0);

  // Evidence state
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [lastCypher, setLastCypher] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<Record<string, unknown>>({});

  const nextIdRef = useRef(1);
  function createId(): string {
    return String(nextIdRef.current++);
  }

  const loadModel = useCallback(async () => {
    if (modelStatus === 'loading' || modelStatus === 'ready') return;
    setModelStatus('loading');
    setModelProgress(0);
    try {
      await initEngine(undefined, (p) => {
        setModelProgress(p.progress);
        if (p.stage === 'error') setModelStatus('error');
      });
      setModelStatus('ready');
    } catch {
      setModelStatus('error');
    }
  }, [modelStatus]);

  const handleSubmit = useCallback(
    async (question: string) => {
      if (modelStatus !== 'ready') return;
      setLoading(true);

      const userMsg: ChatMessage = {
        id: createId(),
        role: 'user',
        content: question,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        // Step 1: Generate Cypher query
        const result = await generateQuery(question);

        if (!result.success || !result.query) {
          const errMsg: ChatMessage = {
            id: createId(),
            role: 'assistant',
            content: result.error ?? 'Failed to generate a valid query.',
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, errMsg]);
          setLoading(false);
          return;
        }

        const { cypher, parameters = {}, explanation } = result.query;
        setLastCypher(cypher);
        setLastParams(parameters);

        // Step 2: Execute graph query via API
        let graphNodes: GraphNode[] = [];
        let graphEdges: GraphEdge[] = [];
        let fetchedRows: TableRow[] = [];
        let count = 0;

        try {
          const graphResult = await queryGraph({
            edge_types: ['DONATED_TO'],
            max_nodes: 100,
          });
          graphNodes = graphResult.data.nodes;
          graphEdges = graphResult.data.edges;
          count = graphNodes.length;
        } catch {
          // Fallback: use mock table data structure
          count = 0;
        }

        setNodes(graphNodes);
        setEdges(graphEdges);
        setRows(fetchedRows);
        setResultCount(count);

        // Step 3: Summarize results
        const summaryResult = await summarizeResults({
          question,
          cypher,
          nodes: graphNodes,
          edges: graphEdges,
          rows: fetchedRows,
          resultCount: count,
        });

        const assistantContent = summaryResult.passed
          ? summaryResult.summary
          : `Summary blocked by content guardrails: ${summaryResult.violations
              .filter((v) => v.severity === 'block')
              .map((v) => `${v.pattern} ("${v.matched}")`)
              .join(', ')}`;

        const assistantMsg: ChatMessage = {
          id: createId(),
          role: 'assistant',
          content: assistantContent,
          cypher,
          parameters,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Step 4: Save audit log
        const modelId = getModelId() ?? 'unknown';
        const entry = {
          natural_language_query: question,
          generated_query: cypher,
          query_params: parameters,
          model_id: modelId,
          model_version: '1.0.0',
          execution_mode: 'api' as const,
          result_count: count,
          summary_text: summaryResult.passed ? summaryResult.summary : undefined,
        };

        const saved = await saveAuditEntry(entry);

        // Sync to server (best-effort)
        postAuditLog(toServerPayload(saved)).catch(() => {});
      } catch (err) {
        const errMsg: ChatMessage = {
          id: createId(),
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'An unexpected error occurred.'}`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setLoading(false);
      }
    },
    [modelStatus],
  );

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>AI Query</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {!isWebGPUAvailable() && (
            <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>
              WebGPU not available
            </span>
          )}
          {modelStatus !== 'ready' && (
            <button
              type="button"
              onClick={loadModel}
              disabled={modelStatus === 'loading'}
              style={{
                padding: '0.5rem 1rem',
                background: modelStatus === 'loading' ? '#9ca3af' : '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: modelStatus === 'loading' ? 'default' : 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {modelStatus === 'loading' ? 'Loading…' : 'Load Model'}
            </button>
          )}
          {modelStatus === 'ready' && (
            <span style={{ fontSize: '0.8rem', color: '#10b981' }}>Model ready</span>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          minHeight: '500px',
        }}
      >
        {/* Left: Chat + Evidence */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ flex: 1, minHeight: '300px' }}>
            <ChatPanel
              onSubmit={handleSubmit}
              messages={messages}
              streaming={streaming}
              streamContent={streamContent}
              loading={loading}
              disabled={modelStatus !== 'ready'}
              modelStatus={modelStatus}
              modelProgress={modelProgress}
              lastCypher={lastCypher}
            />
          </div>

          {resultCount > 0 && (
            <EvidenceViewer
              rows={rows}
              nodes={nodes}
              edges={edges}
              cypher={lastCypher ?? undefined}
              parameters={lastParams}
              resultCount={resultCount}
            />
          )}
        </div>

        {/* Right: Graph visualization */}
        <div
          style={{
            border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: '0.5rem',
            minHeight: '500px',
          }}
        >
          {nodes.length > 0 ? (
            <GraphView nodes={nodes} edges={edges} />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#9ca3af',
              }}
            >
              Query results will appear here as a graph
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
