import { describe, it, expect, vi } from 'vitest';

// Mock the @mlc-ai/web-llm module to avoid ESM/CJS issues in tests
vi.mock('@mlc-ai/web-llm', () => ({
  MLCEngine: vi.fn(),
}));

import { validateCypher, buildMessages, SYSTEM_PROMPT } from '../lib/ai-pipeline.js';

describe('ai-pipeline', () => {
  // ============================================================
  // validateCypher
  // ============================================================

  describe('validateCypher', () => {
    it('accepts a valid read-only Cypher query', () => {
      const cypher = `MATCH (d:Person)-[don:DONATED_TO]->(c:Committee) WHERE don.amount >= $min RETURN d.canonical_name, SUM(don.amount) ORDER BY SUM(don.amount) DESC LIMIT 20`;
      expect(validateCypher(cypher)).toBeNull();
    });

    it('rejects empty query', () => {
      expect(validateCypher('')).toBe('Empty query');
      expect(validateCypher('   ')).toBe('Empty query');
    });

    it('rejects DELETE operations', () => {
      const cypher = 'MATCH (n) DELETE n';
      expect(validateCypher(cypher)).toMatch(/Disallowed.*DELETE/i);
    });

    it('rejects DROP operations', () => {
      const cypher = 'MATCH (n) DROP n';
      expect(validateCypher(cypher)).toMatch(/Disallowed.*DROP/i);
    });

    it('rejects CREATE operations', () => {
      const cypher = 'CREATE (n:Person {name: "evil"}) RETURN n';
      expect(validateCypher(cypher)).toMatch(/Disallowed.*CREATE/i);
    });

    it('rejects SET operations', () => {
      const cypher = 'MATCH (n:Person) SET n.name = "hacked" RETURN n';
      expect(validateCypher(cypher)).toMatch(/Disallowed.*SET/i);
    });

    it('rejects DETACH operations', () => {
      const cypher = 'MATCH (n) DETACH DELETE n';
      // DELETE pattern fires first but DETACH is also blocked
      expect(validateCypher(cypher)).toMatch(/Disallowed/i);
    });

    it('rejects MERGE operations', () => {
      const cypher = 'MERGE (n:Person {name: "test"}) RETURN n';
      expect(validateCypher(cypher)).toMatch(/Disallowed.*MERGE/i);
    });

    it('rejects query without MATCH', () => {
      const cypher = 'RETURN 1';
      expect(validateCypher(cypher)).toBe('Query must contain a MATCH clause');
    });

    it('rejects query without RETURN', () => {
      const cypher = 'MATCH (n:Person)';
      expect(validateCypher(cypher)).toBe('Query must contain a RETURN clause');
    });

    it('rejects unknown node labels after (', () => {
      const cypher = 'MATCH (n:FakeLabel) RETURN n';
      expect(validateCypher(cypher)).toBe('Unknown label: FakeLabel');
    });

    it('accepts valid edge labels', () => {
      const cypher = 'MATCH (a)-[r:DONATED_TO]->(b:Committee) RETURN a, r, b';
      expect(validateCypher(cypher)).toBeNull();
    });

    it('accepts all known labels', () => {
      const cypher = `MATCH (p:Person)-[d:DONATED_TO]->(c:Committee), (o:Organization)-[l:LOBBIED_FOR]->(o2:Organization)-[:IN_SECTOR]->(s:Sector), (p)-[:VOTED_ON]->(b:Bill) RETURN p LIMIT 10`;
      expect(validateCypher(cypher)).toBeNull();
    });
  });

  // ============================================================
  // buildMessages
  // ============================================================

  describe('buildMessages', () => {
    it('includes system prompt with graph schema', () => {
      const msgs = buildMessages('Who donated the most?');
      expect(msgs).toHaveLength(2);
      expect(msgs[0].role).toBe('system');
      expect(msgs[0].content).toContain('DONATED_TO');
      expect(msgs[0].content).toContain('Person');
      expect(msgs[0].content).toContain('Committee');
    });

    it('includes user question as second message', () => {
      const msgs = buildMessages('Top lobbyists in 2024?');
      expect(msgs[1].role).toBe('user');
      expect(msgs[1].content).toBe('Top lobbyists in 2024?');
    });

    it('system prompt contains all node labels', () => {
      expect(SYSTEM_PROMPT).toContain('Person');
      expect(SYSTEM_PROMPT).toContain('Committee');
      expect(SYSTEM_PROMPT).toContain('Organization');
      expect(SYSTEM_PROMPT).toContain('Bill');
      expect(SYSTEM_PROMPT).toContain('Sector');
    });

    it('system prompt contains all edge labels', () => {
      expect(SYSTEM_PROMPT).toContain('DONATED_TO');
      expect(SYSTEM_PROMPT).toContain('LOBBIED_FOR');
      expect(SYSTEM_PROMPT).toContain('LOBBIED_BY');
      expect(SYSTEM_PROMPT).toContain('VOTED_ON');
      expect(SYSTEM_PROMPT).toContain('SPONSORED');
      expect(SYSTEM_PROMPT).toContain('AFFILIATED_WITH');
      expect(SYSTEM_PROMPT).toContain('IN_SECTOR');
      expect(SYSTEM_PROMPT).toContain('PARENT_OF');
    });
  });
});
