import type { LanguageModelMiddleware } from 'ai';

import { createSimulateStreamingPlugin } from '../simulateStreaming';

function extractMiddleware(): LanguageModelMiddleware {
  const context = { middlewares: [] as LanguageModelMiddleware[] };
  createSimulateStreamingPlugin().configureContext?.(context as never);
  return context.middlewares[0];
}

describe('simulateStreaming middleware', () => {
  it('replays a non-streaming generate() result as a single simulated stream', async () => {
    const middleware = extractMiddleware();
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'text', text: 'hello' }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
      response: { id: 'resp-1' },
    }));

    const result = await middleware.wrapStream?.({
      doGenerate,
      doStream: vi.fn(),
      params: {} as never,
      model: {} as never,
    } as never);

    const reader = result?.stream.getReader();
    const types: string[] = [];
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      types.push(value.type);
    }

    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(types).toEqual([
      'stream-start',
      'response-metadata',
      'text-start',
      'text-delta',
      'text-end',
      'finish',
    ]);
  });
});
