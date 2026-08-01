import { loggerService } from '@logger';
import type { UIMessageChunk } from 'ai';

import { withReasoningTimingMetadata } from '../withReasoningTimingMetadata';

function streamFrom(chunks: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

function cherryMeta(chunk: UIMessageChunk): Record<string, unknown> | undefined {
  const metadata =
    'providerMetadata' in chunk
      ? (chunk.providerMetadata as Record<string, unknown> | undefined)
      : undefined;
  return metadata?.cherry as Record<string, unknown> | undefined;
}

describe('withReasoningTimingMetadata', () => {
  let debugSpy: jest.SpyInstance;

  beforeEach(() => {
    debugSpy = jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('adds thinkingMs to reasoning-end chunks', async () => {
    jest.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(432);

    const chunks = await collect(
      withReasoningTimingMetadata(
        streamFrom([
          { type: 'reasoning-start', id: 'r1' } as UIMessageChunk,
          { type: 'reasoning-delta', id: 'r1', delta: 'thinking' } as UIMessageChunk,
          { type: 'reasoning-end', id: 'r1' } as UIMessageChunk,
          { type: 'text-start', id: 't1' } as UIMessageChunk,
          { type: 'text-delta', id: 't1', delta: 'answer' } as UIMessageChunk,
        ]),
      ),
    );

    expect(cherryMeta(chunks[2])?.thinkingMs).toBe(332);
  });

  it('preserves existing provider metadata and cherry fields', async () => {
    jest.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(35);

    const chunks = await collect(
      withReasoningTimingMetadata(
        streamFrom([
          { type: 'reasoning-start', id: 'r1' } as UIMessageChunk,
          {
            type: 'reasoning-end',
            id: 'r1',
            providerMetadata: {
              openai: { itemId: 'provider-item' },
              cherry: { existing: true },
            },
          } as UIMessageChunk,
        ]),
      ),
    );

    const reasoningEnd = chunks[1] as UIMessageChunk & {
      providerMetadata: { openai: Record<string, unknown>; cherry: Record<string, unknown> };
    };
    expect(reasoningEnd.providerMetadata.openai).toEqual({ itemId: 'provider-item' });
    expect(reasoningEnd.providerMetadata.cherry).toEqual({
      existing: true,
      thinkingMs: 25,
      startedAt: expect.any(Number),
    });
  });

  it('merges reasoning-start provider metadata into the reasoning-end chunk', async () => {
    jest.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(35);

    const chunks = await collect(
      withReasoningTimingMetadata(
        streamFrom([
          {
            type: 'reasoning-start',
            id: 'r1',
            providerMetadata: {
              'claude-code': { parentToolCallId: 'parent-tool' },
              cherry: { transport: 'claude-agent' },
            },
          } as UIMessageChunk,
          {
            type: 'reasoning-end',
            id: 'r1',
            providerMetadata: {
              openai: { itemId: 'provider-item' },
              cherry: { existing: true },
            },
          } as UIMessageChunk,
        ]),
      ),
    );

    const reasoningEnd = chunks[1] as UIMessageChunk & {
      providerMetadata: {
        'claude-code': Record<string, unknown>;
        openai: Record<string, unknown>;
        cherry: Record<string, unknown>;
      };
    };
    expect(reasoningEnd.providerMetadata['claude-code']).toEqual({
      parentToolCallId: 'parent-tool',
    });
    expect(reasoningEnd.providerMetadata.openai).toEqual({ itemId: 'provider-item' });
    expect(reasoningEnd.providerMetadata.cherry).toEqual({
      transport: 'claude-agent',
      existing: true,
      thinkingMs: 25,
      startedAt: expect.any(Number),
    });
  });

  it('merges reasoning-delta provider metadata into the reasoning-end chunk', async () => {
    jest.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(35);

    const chunks = await collect(
      withReasoningTimingMetadata(
        streamFrom([
          { type: 'reasoning-start', id: 'r1' } as UIMessageChunk,
          { type: 'reasoning-delta', id: 'r1', delta: 'thinking' } as UIMessageChunk,
          {
            type: 'reasoning-delta',
            id: 'r1',
            delta: '',
            providerMetadata: { anthropic: { signature: 'sig-abc' } },
          } as UIMessageChunk,
          { type: 'reasoning-end', id: 'r1' } as UIMessageChunk,
        ]),
      ),
    );

    const reasoningEnd = chunks[3] as UIMessageChunk & {
      providerMetadata: { anthropic: Record<string, unknown>; cherry: Record<string, unknown> };
    };
    expect(reasoningEnd.providerMetadata.anthropic).toEqual({ signature: 'sig-abc' });
    expect(reasoningEnd.providerMetadata.cherry).toEqual({
      thinkingMs: 25,
      startedAt: expect.any(Number),
    });
  });

  it('tracks multiple reasoning ids independently', async () => {
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(350)
      .mockReturnValueOnce(550);

    const chunks = await collect(
      withReasoningTimingMetadata(
        streamFrom([
          { type: 'reasoning-start', id: 'a' } as UIMessageChunk,
          { type: 'reasoning-start', id: 'b' } as UIMessageChunk,
          { type: 'reasoning-end', id: 'a' } as UIMessageChunk,
          { type: 'reasoning-end', id: 'b' } as UIMessageChunk,
        ]),
      ),
    );

    expect(cherryMeta(chunks[2])?.thinkingMs).toBe(250);
    expect(cherryMeta(chunks[3])?.thinkingMs).toBe(350);
  });

  it('passes through reasoning-end chunks untouched if no matching reasoning-start was seen', async () => {
    const chunks = await collect(
      withReasoningTimingMetadata(
        streamFrom([{ type: 'reasoning-end', id: 'unmatched-id' } as UIMessageChunk]),
      ),
    );

    expect(chunks[0]).toEqual({ type: 'reasoning-end', id: 'unmatched-id' });
    expect(cherryMeta(chunks[0])).toBeUndefined();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('reasoning-end received with no matching reasoning-start'),
      expect.objectContaining({ id: 'unmatched-id' }),
    );
  });

  it('warns when a reasoning-start arrives for an id whose previous start was never ended', async () => {
    // Three performance.now() calls in order: first start (100),
    // second start (200, overwrites the first), end (300).
    jest
      .spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(300);

    const chunks = await collect(
      withReasoningTimingMetadata(
        streamFrom([
          { type: 'reasoning-start', id: 'r1' } as UIMessageChunk,
          { type: 'reasoning-start', id: 'r1' } as UIMessageChunk,
          { type: 'reasoning-end', id: 'r1' } as UIMessageChunk,
        ]),
      ),
    );

    // The second start overwrote the first, so the end's thinkingMs is the
    // delta from the second start (200 -> 300 = 100), not the first.
    expect(cherryMeta(chunks[2])?.thinkingMs).toBe(100);
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('reasoning-start received for an id that was never ended'),
      expect.objectContaining({ id: 'r1' }),
    );
  });
});
