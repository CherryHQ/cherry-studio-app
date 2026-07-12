import type { LanguageModelMiddleware } from 'ai';

import {
  createReasoningExtractionPlugin,
  INLINE_REASONING_SDK_PROVIDER_IDS,
} from '../reasoningExtraction';

function extractMiddleware(options?: { tagName?: string }): LanguageModelMiddleware {
  const context = { middlewares: [] as LanguageModelMiddleware[] };
  createReasoningExtractionPlugin(options).configureContext?.(context as never);
  return context.middlewares[0];
}

describe('reasoningExtraction middleware', () => {
  it('extracts <think>…</think> blocks into a separate reasoning part by default', async () => {
    const middleware = extractMiddleware();
    const doGenerate = jest.fn(async () => ({
      content: [{ type: 'text', text: '<think>secret plan</think>visible answer' }],
      finishReason: 'stop',
    }));

    const result = await middleware.wrapGenerate?.({
      doGenerate,
      params: {} as never,
      model: {} as never,
    } as never);

    expect(result?.content).toEqual([
      { type: 'reasoning', text: 'secret plan' },
      { type: 'text', text: 'visible answer' },
    ]);
  });

  it('uses a custom tag name when provided', async () => {
    const middleware = extractMiddleware({ tagName: 'thinking' });
    const doGenerate = jest.fn(async () => ({
      content: [{ type: 'text', text: '<thinking>hmm</thinking>done' }],
      finishReason: 'stop',
    }));

    const result = await middleware.wrapGenerate?.({
      doGenerate,
      params: {} as never,
      model: {} as never,
    } as never);

    expect(result?.content).toEqual([
      { type: 'reasoning', text: 'hmm' },
      { type: 'text', text: 'done' },
    ]);
  });

  it('leaves text without a matching tag untouched', async () => {
    const middleware = extractMiddleware();
    const doGenerate = jest.fn(async () => ({
      content: [{ type: 'text', text: 'plain answer, no tags here' }],
      finishReason: 'stop',
    }));

    const result = await middleware.wrapGenerate?.({
      doGenerate,
      params: {} as never,
      model: {} as never,
    } as never);

    expect(result?.content).toEqual([{ type: 'text', text: 'plain answer, no tags here' }]);
  });
});

describe('INLINE_REASONING_SDK_PROVIDER_IDS', () => {
  it('covers the openai-style providers that emit tagged reasoning text', () => {
    expect([...INLINE_REASONING_SDK_PROVIDER_IDS].sort()).toEqual(
      [
        'azure',
        'azure-responses',
        'openai',
        'openai-chat',
        'openai-compatible',
        'openai-response',
      ].sort(),
    );
  });
});
