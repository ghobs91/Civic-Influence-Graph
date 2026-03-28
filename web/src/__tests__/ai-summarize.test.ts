import { describe, it, expect, vi } from 'vitest';

// Mock the @mlc-ai/web-llm module to avoid ESM/CJS issues in tests
vi.mock('@mlc-ai/web-llm', () => ({
  MLCEngine: vi.fn(),
}));

import { checkGuardrails, SUMMARIZE_SYSTEM_PROMPT } from '../lib/ai-summarize.js';

describe('ai-summarize guardrails', () => {
  describe('checkGuardrails', () => {
    it('returns no violations for neutral text', () => {
      const text = 'A total of $50,000 was donated to Committee ABC between Jan 2025 and Mar 2025. 12 transactions were recorded, with filing IDs F001 through F012.';
      const violations = checkGuardrails(text);
      expect(violations).toHaveLength(0);
    });

    it('blocks "corrupt"', () => {
      const text = 'The donations reveal a corrupt pattern of influence.';
      const violations = checkGuardrails(text);
      expect(violations.some((v) => v.severity === 'block' && v.matched === 'corrupt')).toBe(true);
    });

    it('blocks "scandal"', () => {
      const text = 'This is a major scandal involving PAC funds.';
      const violations = checkGuardrails(text);
      expect(violations.some((v) => v.severity === 'block' && v.pattern === 'moral_judgment')).toBe(true);
    });

    it('blocks "suspicious"', () => {
      const text = 'The suspicious timing of these donations warrants further review.';
      const violations = checkGuardrails(text);
      expect(violations.some((v) => v.severity === 'block' && v.pattern === 'value_judgment')).toBe(true);
    });

    it('blocks recommendations', () => {
      const text = 'Based on the data, you should vote against this candidate.';
      const violations = checkGuardrails(text);
      expect(violations.some((v) => v.severity === 'block' && v.pattern === 'recommendation')).toBe(true);
    });

    it('blocks generalizations', () => {
      const text = 'Democrats tend to receive more PAC donations in this sector.';
      const violations = checkGuardrails(text);
      expect(violations.some((v) => v.severity === 'block' && v.pattern === 'generalization')).toBe(true);
    });

    it('warns on evaluative language', () => {
      const text = 'The good news is that donations increased.';
      const violations = checkGuardrails(text);
      expect(violations.some((v) => v.severity === 'warning' && v.pattern === 'evaluative_language')).toBe(true);
    });

    it('warns on absolute language', () => {
      const text = 'All donations came from corporate sources.';
      const violations = checkGuardrails(text);
      expect(violations.some((v) => v.severity === 'warning' && v.pattern === 'absolute_language')).toBe(true);
    });

    it('warns on editorializing', () => {
      const text = 'Clearly, the funding pattern shifted in Q3.';
      const violations = checkGuardrails(text);
      expect(violations.some((v) => v.severity === 'warning' && v.pattern === 'editorializing')).toBe(true);
    });

    it('can find multiple violations', () => {
      const text = 'This corrupt pattern obviously shows Democrats tend to get more.';
      const violations = checkGuardrails(text);
      expect(violations.length).toBeGreaterThanOrEqual(3);
      // block: corrupt (moral_judgment), tend to (generalization)
      // warn: obviously (editorializing)
      expect(violations.some((v) => v.severity === 'block')).toBe(true);
      expect(violations.some((v) => v.severity === 'warning')).toBe(true);
    });
  });

  describe('SUMMARIZE_SYSTEM_PROMPT', () => {
    it('includes neutrality instructions', () => {
      expect(SUMMARIZE_SYSTEM_PROMPT).toContain('neutral');
      expect(SUMMARIZE_SYSTEM_PROMPT).toContain('passive voice');
    });

    it('prohibits value judgments', () => {
      expect(SUMMARIZE_SYSTEM_PROMPT).toContain('corrupt');
      expect(SUMMARIZE_SYSTEM_PROMPT).toContain('value judgments');
    });

    it('requires source citations', () => {
      expect(SUMMARIZE_SYSTEM_PROMPT).toContain('filing ID');
    });
  });
});
