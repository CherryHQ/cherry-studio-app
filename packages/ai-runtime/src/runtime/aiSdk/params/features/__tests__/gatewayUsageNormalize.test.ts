import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';

import { createGatewayUsageNormalizePlugin } from '../gatewayUsageNormalize';

function extractMiddleware(): LanguageModelMiddleware {
  const context = { middlewares: [] as LanguageModelMiddleware[] };
  createGatewayUsageNormalizePlugin().configureContext?.(context as never);
  return context.middlewares[0];
}

async function collect(
  stream: ReadableStream<LanguageModelV3StreamPart>,
): Promise<LanguageModelV3StreamPart[]> {
  const reader = stream.getReader();
  const chunks: LanguageModelV3StreamPart[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

async function wrapStream(
  middleware: LanguageModelMiddleware,
  doStream: () => Promise<{ stream: ReadableStream<LanguageModelV3StreamPart> }>,
): Promise<{ stream: ReadableStream<LanguageModelV3StreamPart> }> {
  const result = await middleware.wrapStream?.({
    doStream,
    params: {} as never,
    model: {} as never,
  } as never);
  if (!result) throw new Error('expected wrapStream to be defined');
  return result;
}

describe('gatewayUsageNormalize middleware', () => {
  it('normalizes a flat finish usage into the nested V3 shape', async () => {
    const middleware = extractMiddleware();
    const doStream = vi.fn(async () => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          controller.enqueue({
            type: 'finish',
            finishReason: 'stop',
            usage: {
              inputTokens: 10,
              outputTokens: 5,
              totalTokens: 15,
              reasoningTokens: 2,
              cachedInputTokens: 3,
            },
          } as never);
          controller.close();
        },
      }),
    }));

    const result = await wrapStream(middleware, doStream);

    const [finishChunk] = await collect(result.stream);
    expect(finishChunk).toMatchObject({
      type: 'finish',
      usage: {
        inputTokens: { total: 10, noCache: undefined, cacheRead: 3, cacheWrite: undefined },
        outputTokens: { total: 5, text: undefined, reasoning: 2 },
      },
    });
  });

  it('leaves an already-nested V3 usage shape untouched', async () => {
    const middleware = extractMiddleware();
    const nestedUsage = { inputTokens: { total: 10 }, outputTokens: { total: 5 } };
    const doStream = vi.fn(async () => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: nestedUsage } as never);
          controller.close();
        },
      }),
    }));

    const result = await wrapStream(middleware, doStream);

    const [finishChunk] = await collect(result.stream);
    expect((finishChunk as { usage: unknown }).usage).toBe(nestedUsage);
  });

  it('passes non-finish chunks through unchanged', async () => {
    const middleware = extractMiddleware();
    const textDelta: LanguageModelV3StreamPart = { type: 'text-delta', id: '0', delta: 'hi' };
    const doStream = vi.fn(async () => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          controller.enqueue(textDelta);
          controller.close();
        },
      }),
    }));

    const result = await wrapStream(middleware, doStream);

    const chunks = await collect(result.stream);
    expect(chunks).toEqual([textDelta]);
  });
});
