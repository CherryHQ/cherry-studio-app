import type { EmbeddingModelV3CallOptions, ImageModelV3CallOptions } from '@ai-sdk/provider';
import { MockEmbeddingModelV3, MockImageModelV3, MockProviderV3 } from 'ai/test';

import { RuntimeExecutor } from '../executor';
import type { RuntimeProviderCallEvent } from '../types';

function createTestExecutor() {
  return RuntimeExecutor.create('openai', new MockProviderV3(), { apiKey: 'test-key' });
}

describe('RuntimeExecutor provider-call observation', () => {
  it('emits one embedding event for every SDK batch', async () => {
    const doEmbed = jest.fn(async ({ values }: EmbeddingModelV3CallOptions) => ({
      embeddings: values.map(() => [0.1, 0.2]),
      usage: { tokens: values.length },
      warnings: [],
    }));
    const model = new MockEmbeddingModelV3({
      provider: 'openai',
      modelId: 'text-embedding',
      maxEmbeddingsPerCall: 2,
      supportsParallelCalls: false,
      doEmbed,
    });
    const events: RuntimeProviderCallEvent[] = [];

    const result = await createTestExecutor().embedMany({
      model,
      values: ['a', 'b', 'c', 'd', 'e'],
      onProviderCall: (event) => events.push(event),
    });

    expect(result.embeddings).toHaveLength(5);
    expect(doEmbed).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(3);
    expect(
      events.map((event) => (event.modality === 'embedding' ? event.usage?.tokens : undefined)),
    ).toEqual([2, 2, 1]);
    expect(new Set(events.map((event) => event.requestId)).size).toBe(3);
  });

  it('emits one image event for every SDK batch', async () => {
    const doGenerate = jest.fn(async ({ n }: ImageModelV3CallOptions) => ({
      images: Array.from({ length: n }, () => 'AAAA'),
      warnings: [],
      response: { timestamp: new Date(), modelId: 'image-model', headers: undefined },
    }));
    const model = new MockImageModelV3({
      provider: 'openai',
      modelId: 'image-model',
      maxImagesPerCall: 2,
      doGenerate,
    });
    const events: RuntimeProviderCallEvent[] = [];

    const result = await createTestExecutor().generateImage({
      model,
      prompt: 'a cat',
      n: 5,
      onProviderCall: (event) => events.push(event),
    });

    expect(result.images).toHaveLength(5);
    expect(doGenerate).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(3);
    expect(
      events.map((event) => (event.modality === 'image' ? event.imageCount : undefined)),
    ).toEqual([2, 2, 1]);
    expect(new Set(events.map((event) => event.requestId)).size).toBe(3);
  });

  it('does not let an observation handler change a successful result', async () => {
    const model = new MockEmbeddingModelV3({
      doEmbed: {
        embeddings: [[0.1]],
        usage: { tokens: 1 },
        warnings: [],
      },
    });

    await expect(
      createTestExecutor().embedMany({
        model,
        values: ['a'],
        onProviderCall: () => {
          throw new Error('analytics unavailable');
        },
      }),
    ).resolves.toMatchObject({ embeddings: [[0.1]], usage: { tokens: 1 } });
  });
});
