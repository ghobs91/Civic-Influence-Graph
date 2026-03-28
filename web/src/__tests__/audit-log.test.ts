import { describe, it, expect } from 'vitest';
import { toServerPayload, type AuditEntry } from '../lib/audit-log.js';

const SAMPLE_ENTRY: AuditEntry = {
  id: 'test-uuid-123',
  timestamp: '2025-06-01T00:00:00Z',
  natural_language_query: 'Who donated the most?',
  generated_query: 'MATCH (d:Person)-[don:DONATED_TO]->(c:Committee) RETURN d LIMIT 10',
  query_params: { min: 1000 },
  model_id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
  model_version: '0.2.82',
  execution_mode: 'api',
  result_count: 10,
  summary_text: 'A total of 10 donors were found.',
  client_info: {
    user_agent: 'Mozilla/5.0 (test)',
    session_id: 'sess-abc',
  },
};

describe('audit-log', () => {
  describe('toServerPayload', () => {
    it('extracts server-relevant fields', () => {
      const payload = toServerPayload(SAMPLE_ENTRY);
      expect(payload.natural_language_query).toBe('Who donated the most?');
      expect(payload.generated_query).toContain('MATCH');
      expect(payload.model_id).toBe('Phi-3.5-mini-instruct-q4f16_1-MLC');
      expect(payload.model_version).toBe('0.2.82');
      expect(payload.result_count).toBe(10);
      expect(payload.client_info).toEqual({
        user_agent: 'Mozilla/5.0 (test)',
        session_id: 'sess-abc',
      });
    });

    it('omits client-only fields like id, timestamp, execution_mode', () => {
      const payload = toServerPayload(SAMPLE_ENTRY);
      expect(payload).not.toHaveProperty('id');
      expect(payload).not.toHaveProperty('timestamp');
      expect(payload).not.toHaveProperty('execution_mode');
      expect(payload).not.toHaveProperty('summary_text');
    });

    it('preserves query_params as object', () => {
      const payload = toServerPayload(SAMPLE_ENTRY);
      expect(payload.query_params).toEqual({ min: 1000 });
    });
  });
});
