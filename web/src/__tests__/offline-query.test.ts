import { describe, it, expect } from 'vitest';
import { parseCypher } from '../lib/offline-query.js';

describe('offline-query', () => {
  describe('parseCypher', () => {
    it('extracts node label from (n:Person)', () => {
      const result = parseCypher('MATCH (n:Person) RETURN n LIMIT 10');
      expect(result.nodeLabel).toBe('Person');
    });

    it('extracts edge label from [r:DONATED_TO]', () => {
      const result = parseCypher('MATCH (a)-[r:DONATED_TO]->(b) RETURN a, b LIMIT 20');
      expect(result.edgeLabel).toBe('DONATED_TO');
    });

    it('extracts LIMIT value', () => {
      const result = parseCypher('MATCH (n:Committee) RETURN n LIMIT 25');
      expect(result.limit).toBe(25);
    });

    it('defaults LIMIT to 50', () => {
      const result = parseCypher('MATCH (n:Organization) RETURN n');
      expect(result.limit).toBe(50);
    });

    it('caps LIMIT at 200', () => {
      const result = parseCypher('MATCH (n:Person) RETURN n LIMIT 999');
      expect(result.limit).toBe(200);
    });

    it('extracts both node and edge labels', () => {
      const result = parseCypher(
        "MATCH (p:Person)-[d:DONATED_TO]->(c:Committee) RETURN p LIMIT 10",
      );
      expect(result.nodeLabel).toBe('Person');
      expect(result.edgeLabel).toBe('DONATED_TO');
    });

    it("extracts name filter from .name = 'value'", () => {
      const result = parseCypher(
        "MATCH (p:Person) WHERE p.name = 'Alice Jones' RETURN p LIMIT 10",
      );
      expect(result.nameFilter).toBe('Alice Jones');
    });

    it('handles query with no labels', () => {
      const result = parseCypher('MATCH (n) RETURN n LIMIT 5');
      expect(result.nodeLabel).toBeUndefined();
      expect(result.edgeLabel).toBeUndefined();
      expect(result.limit).toBe(5);
    });
  });
});
