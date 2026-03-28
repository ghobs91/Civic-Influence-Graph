/**
 * WebLLM integration library (T047).
 *
 * Wraps @mlc-ai/web-llm to provide:
 * - Model download + initialization with progress reporting
 * - OpenAI-compatible chat completion API
 * - Streaming response support
 * - Cache management for model weights
 */

import * as webllm from '@mlc-ai/web-llm';

// ============================================================
// TYPES
// ============================================================

export interface ModelProgress {
  stage: 'downloading' | 'loading' | 'ready' | 'error';
  progress: number; // 0-1
  message: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export type ProgressCallback = (progress: ModelProgress) => void;

// ============================================================
// CONFIGURATION
// ============================================================

/** Default model — Phi-3-mini quantized for browser use. */
export const DEFAULT_MODEL_ID = 'Phi-3.5-mini-instruct-q4f16_1-MLC';

// ============================================================
// ENGINE SINGLETON
// ============================================================

let engineInstance: webllm.MLCEngine | null = null;
let currentModelId: string | null = null;
let initPromise: Promise<webllm.MLCEngine> | null = null;

/**
 * Initialize the WebLLM engine. Downloads model on first call,
 * reuses cached weights on subsequent calls. Safe to call multiple
 * times — returns the existing engine if already initialized with
 * the same model.
 */
export async function initEngine(
  modelId: string = DEFAULT_MODEL_ID,
  onProgress?: ProgressCallback,
): Promise<webllm.MLCEngine> {
  // Return existing engine if same model
  if (engineInstance && currentModelId === modelId) {
    onProgress?.({ stage: 'ready', progress: 1, message: 'Model already loaded' });
    return engineInstance;
  }

  // Avoid duplicate initialization
  if (initPromise && currentModelId === modelId) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      onProgress?.({ stage: 'downloading', progress: 0, message: 'Initializing model...' });

      const engine = new webllm.MLCEngine();

      await engine.reload(modelId, {
        initProgressCallback: (report: webllm.InitProgressReport) => {
          const progress = report.progress ?? 0;
          const stage = progress < 1 ? 'downloading' : 'loading';
          onProgress?.({ stage, progress, message: report.text });
        },
      });

      engineInstance = engine;
      currentModelId = modelId;
      onProgress?.({ stage: 'ready', progress: 1, message: 'Model ready' });
      return engine;
    } catch (err) {
      initPromise = null;
      onProgress?.({
        stage: 'error',
        progress: 0,
        message: err instanceof Error ? err.message : 'Failed to load model',
      });
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Get the current engine instance if initialized.
 */
export function getEngine(): webllm.MLCEngine | null {
  return engineInstance;
}

/**
 * Destroy the engine and free GPU/WASM resources.
 */
export async function destroyEngine(): Promise<void> {
  if (engineInstance) {
    engineInstance.unload();
    engineInstance = null;
    currentModelId = null;
    initPromise = null;
  }
}

// ============================================================
// CHAT API
// ============================================================

/**
 * Send a chat completion request. Requires engine to be initialized.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts?: { temperature?: number; max_tokens?: number; json_mode?: boolean },
): Promise<ChatResponse> {
  const engine = engineInstance;
  if (!engine) {
    throw new Error('WebLLM engine not initialized. Call initEngine() first.');
  }

  const response = await engine.chat.completions.create({
    messages,
    temperature: opts?.temperature ?? 0.1,
    max_tokens: opts?.max_tokens ?? 1024,
    response_format: opts?.json_mode ? { type: 'json_object' } : undefined,
  });

  const choice = response.choices[0];
  return {
    content: choice?.message?.content ?? '',
    usage: response.usage
      ? {
          prompt_tokens: response.usage.prompt_tokens,
          completion_tokens: response.usage.completion_tokens,
        }
      : undefined,
  };
}

/**
 * Send a streaming chat completion. Yields content chunks as they arrive.
 */
export async function* chatCompletionStream(
  messages: ChatMessage[],
  opts?: { temperature?: number; max_tokens?: number },
): AsyncGenerator<string, void, unknown> {
  const engine = engineInstance;
  if (!engine) {
    throw new Error('WebLLM engine not initialized. Call initEngine() first.');
  }

  const stream = await engine.chat.completions.create({
    messages,
    temperature: opts?.temperature ?? 0.1,
    max_tokens: opts?.max_tokens ?? 1024,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      yield delta;
    }
  }
}

/**
 * Check if WebGPU is available in the current browser.
 */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * Get the model ID currently loaded (or null if none).
 */
export function getModelId(): string | null {
  return currentModelId;
}
