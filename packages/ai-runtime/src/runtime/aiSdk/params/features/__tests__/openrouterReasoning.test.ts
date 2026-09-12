import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';

import { createOpenrouterReasoningPlugin } from '../openrouterReasoning';

function extractMiddleware(): LanguageModelMiddleware {
  const context = { middlewares: [] as LanguageModelMiddleware[] };
  createOpenrouterReasoningPlugin().configureContext?.(context as never);
  return context.middlewares[0];
}

describe('openrouterReasoning middleware', () => {
  it('strips [REDACTED] from generate reasoning content', async () => {
    const middleware = extractMiddleware();
    const doGenerate = vi.fn(async () => ({
      content: [
        { type: 'reasoning', text: 'before [REDACTED] after' },
        { type: 'text', text: 'answer' },
      ],
      finishReason: 'stop',
    }));

    const result = await middleware.wrapGenerate?.({
      doGenerate,
      params: {} as never,
      model: {} as never,
    } as never);

    expect(result?.content).toEqual([
      { type: 'reasoning', text: 'before  after' },
      { type: 'text', text: 'answer' },
    ]);
  });

  it('leaves generate content without [REDACTED] untouched', async () => {
    const middleware = extractMiddleware();
    const doGenerate = vi.fn(async () => ({
      content: [{ type: 'reasoning', text: 'clean reasoning' }],
      finishReason: 'stop',
    }));

    const result = await middleware.wrapGenerate?.({
      doGenerate,
      params: {} as never,
      model: {} as never,
    } as never);

    expect(result?.content).toEqual([{ type: 'reasoning', text: 'clean reasoning' }]);
  });

  it('strips [REDACTED] from streamed reasoning-delta chunks', async () => {
    const middleware = extractMiddleware();
    const chunks: LanguageModelV3StreamPart[] = [
      { type: 'reasoning-delta', id: '0', delta: 'a [REDACTED] b' },
      { type: 'text-delta', id: '1', delta: 'unrelated' },
    ];
    const doStream = vi.fn(async () => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
    }));

    const result = await middleware.wrapStream?.({
      doStream,
      params: {} as never,
      model: {} as never,
    } as never);

    const reader = result?.stream.getReader();
    const collected: LanguageModelV3StreamPart[] = [];
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      collected.push(value);
    }

    expect(collected).toEqual([
      { type: 'reasoning-delta', id: '0', delta: 'a  b' },
      { type: 'text-delta', id: '1', delta: 'unrelated' },
    ]);
  });
});
