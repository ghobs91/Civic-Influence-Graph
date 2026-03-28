import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @mlc-ai/web-llm before importing
vi.mock('@mlc-ai/web-llm', () => {
  const reload = vi.fn().mockResolvedValue(undefined);
  const unload = vi.fn();
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"answer": true}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });

  return {
    MLCEngine: vi.fn().mockImplementation(() => ({
      reload,
      unload,
      chat: { completions: { create } },
    })),
  };
});

import {
  initEngine,
  destroyEngine,
  getEngine,
  getModelId,
  isWebGPUAvailable,
  chatCompletion,
  DEFAULT_MODEL_ID,
} from '../lib/webllm.js';

describe('webllm', () => {
  beforeEach(async () => {
    // Reset singleton state between tests
    await destroyEngine();
  });

  describe('initEngine', () => {
    it('creates an engine with default model', async () => {
      const engine = await initEngine();
      expect(engine).toBeDefined();
      expect(getModelId()).toBe(DEFAULT_MODEL_ID);
    });

    it('reports progress via callback', async () => {
      const progress = vi.fn();
      await initEngine(DEFAULT_MODEL_ID, progress);
      // Should at least call with 'downloading' and 'ready'
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'downloading', progress: 0 }),
      );
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'ready', progress: 1 }),
      );
    });

    it('returns existing engine if already initialized with same model', async () => {
      const first = await initEngine();
      const progress = vi.fn();
      const second = await initEngine(DEFAULT_MODEL_ID, progress);
      expect(second).toBe(first);
      expect(progress).toHaveBeenCalledWith(
        expect.objectContaining({ stage: 'ready', message: 'Model already loaded' }),
      );
    });
  });

  describe('getEngine', () => {
    it('returns null before initialization', () => {
      expect(getEngine()).toBeNull();
    });

    it('returns engine after initialization', async () => {
      await initEngine();
      expect(getEngine()).not.toBeNull();
    });
  });

  describe('destroyEngine', () => {
    it('clears engine and model id', async () => {
      await initEngine();
      expect(getModelId()).not.toBeNull();
      await destroyEngine();
      expect(getEngine()).toBeNull();
      expect(getModelId()).toBeNull();
    });
  });

  describe('chatCompletion', () => {
    it('throws if engine not initialized', async () => {
      await expect(
        chatCompletion([{ role: 'user', content: 'hello' }]),
      ).rejects.toThrow('not initialized');
    });

    it('returns content and usage from engine', async () => {
      await initEngine();
      const response = await chatCompletion([{ role: 'user', content: 'test' }]);
      expect(response.content).toBe('{"answer": true}');
      expect(response.usage?.prompt_tokens).toBe(10);
      expect(response.usage?.completion_tokens).toBe(5);
    });
  });

  describe('isWebGPUAvailable', () => {
    it('returns a boolean', () => {
      const result = isWebGPUAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('DEFAULT_MODEL_ID', () => {
    it('is the Phi-3.5 mini model', () => {
      expect(DEFAULT_MODEL_ID).toContain('Phi-3');
    });
  });
});
