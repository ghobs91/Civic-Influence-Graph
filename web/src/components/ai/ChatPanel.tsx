'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  cypher?: string;
  parameters?: Record<string, unknown>;
  timestamp: string;
}

export interface ChatPanelProps {
  onSubmit: (question: string) => Promise<void>;
  messages: ChatMessage[];
  streaming?: boolean;
  streamContent?: string;
  loading?: boolean;
  disabled?: boolean;
  modelStatus?: 'not-loaded' | 'loading' | 'ready' | 'error';
  modelProgress?: number;
  lastCypher?: string | null;
}

export default function ChatPanel({
  onSubmit,
  messages,
  streaming = false,
  streamContent = '',
  loading = false,
  disabled = false,
  modelStatus = 'not-loaded',
  modelProgress = 0,
  lastCypher = null,
}: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [showCypher, setShowCypher] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, streamContent]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const question = input.trim();
      if (!question || loading || disabled) return;
      setInput('');
      await onSubmit(question);
    },
    [input, loading, disabled, onSubmit],
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: '0.5rem',
        overflow: 'hidden',
      }}
    >
      {/* Model status bar */}
      {modelStatus !== 'ready' && (
        <div
          data-testid="model-status"
          style={{
            padding: '0.5rem 1rem',
            background: modelStatus === 'error' ? '#fef2f2' : '#f0f9ff',
            borderBottom: '1px solid var(--color-border, #e5e7eb)',
            fontSize: '0.875rem',
          }}
        >
          {modelStatus === 'not-loaded' && 'AI model not loaded. Click "Load Model" to start.'}
          {modelStatus === 'loading' && (
            <span>
              Loading model… {Math.round(modelProgress * 100)}%
              <progress
                value={modelProgress}
                max={1}
                style={{ marginLeft: '0.5rem', width: '120px' }}
              />
            </span>
          )}
          {modelStatus === 'error' && 'Failed to load AI model. Check WebGPU support.'}
        </div>
      )}

      {/* Messages area */}
      <div
        data-testid="messages"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {messages.length === 0 && !streaming && (
          <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: '2rem' }}>
            Ask a question about political funding, lobbying, or voting data.
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              padding: '0.625rem 1rem',
              borderRadius: '0.75rem',
              background: msg.role === 'user' ? '#3b82f6' : '#f3f4f6',
              color: msg.role === 'user' ? '#fff' : '#1f2937',
              whiteSpace: 'pre-wrap',
            }}
          >
            {msg.content}
            {msg.cypher && (
              <details style={{ marginTop: '0.5rem', fontSize: '0.8rem', opacity: 0.8 }}>
                <summary>Generated Query</summary>
                <pre style={{ margin: '0.25rem 0 0', overflow: 'auto' }}>{msg.cypher}</pre>
              </details>
            )}
          </div>
        ))}

        {/* Streaming content */}
        {streaming && (
          <div
            data-testid="streaming"
            style={{
              alignSelf: 'flex-start',
              maxWidth: '80%',
              padding: '0.625rem 1rem',
              borderRadius: '0.75rem',
              background: '#f3f4f6',
              color: '#1f2937',
              whiteSpace: 'pre-wrap',
            }}
          >
            {streamContent || '…'}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Cypher viewer toggle */}
      {lastCypher && (
        <div
          style={{
            borderTop: '1px solid var(--color-border, #e5e7eb)',
            padding: '0.5rem 1rem',
          }}
        >
          <button
            type="button"
            onClick={() => setShowCypher((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.8rem',
              color: '#6b7280',
            }}
          >
            {showCypher ? 'Hide' : 'Show'} Generated Query
          </button>
          {showCypher && (
            <pre
              data-testid="cypher-viewer"
              style={{
                margin: '0.5rem 0 0',
                padding: '0.5rem',
                background: '#1f2937',
                color: '#e5e7eb',
                borderRadius: '0.375rem',
                fontSize: '0.8rem',
                overflow: 'auto',
              }}
            >
              {lastCypher}
            </pre>
          )}
        </div>
      )}

      {/* Input form */}
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.75rem 1rem',
          borderTop: '1px solid var(--color-border, #e5e7eb)',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about political data…"
          disabled={disabled || loading}
          aria-label="Query input"
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: '0.375rem',
            fontSize: '0.9rem',
          }}
        />
        <button
          type="submit"
          disabled={disabled || loading || !input.trim()}
          style={{
            padding: '0.5rem 1rem',
            background: disabled || loading ? '#9ca3af' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: disabled || loading ? 'default' : 'pointer',
            fontSize: '0.9rem',
          }}
        >
          {loading ? 'Thinking…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
