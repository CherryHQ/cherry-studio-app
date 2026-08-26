import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import type { Model } from '@/shared/data/types/model';

import { toPiModelPreflight } from '../piModelResolver';

describe('Pi model preflight', () => {
  test('derives image input only from the authoritative registry capability', () => {
    const imageModel = model({
      capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION, MODEL_CAPABILITY.FUNCTION_CALL],
    });
    const textModel = model({ capabilities: [] });

    expect(toPiModelPreflight(imageModel)).toMatchObject({
      inputModalities: ['text', 'image'],
      supportsTools: true,
    });
    expect(toPiModelPreflight(textModel)).toMatchObject({
      inputModalities: ['text'],
      supportsTools: false,
    });
  });

  test('bounds input capacity by both the model limit and reserved output', () => {
    expect(
      toPiModelPreflight(
        model({ contextWindow: 16_000, maxInputTokens: 20_000, maxOutputTokens: 4_000 }),
      ),
    ).toMatchObject({ contextWindow: 16_000, maxInputTokens: 12_000, maxOutputTokens: 4_000 });
  });
});

function model(overrides: Partial<Model>): Model {
  return {
    capabilities: [],
    contextWindow: 128_000,
    maxOutputTokens: 8_000,
    ...overrides,
  } as Model;
}
