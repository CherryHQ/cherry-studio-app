import { describe, expect, it } from 'vitest';

import {
  GeminiModelsResponseSchema,
  OpenAIModelsResponseSchema,
  PoeModelsResponseSchema,
} from '../listModelsSchemas';

describe('model-list response compatibility', () => {
  it.each([
    { name: 'OpenAI-compatible', schema: OpenAIModelsResponseSchema },
    { name: 'Poe', schema: PoeModelsResponseSchema },
  ])('keeps valid $name models when an entry is malformed', ({ schema }) => {
    const result = schema.parse({
      object: 'list',
      data: [
        { id: 'first' },
        null,
        { id: 42 },
        { name: 'missing id' },
        { id: 'last', name: 'Last' },
      ],
    });
    expect(result.data.map((model) => model.id)).toEqual(['first', 'last']);
    expect(result.skippedModelCount).toBe(3);
    expect(schema.safeParse({ data: null }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('accepts an empty model catalog without hiding malformed entries', () => {
    expect(OpenAIModelsResponseSchema.parse({ data: [] })).toMatchObject({
      data: [],
      skippedModelCount: 0,
    });
    expect(OpenAIModelsResponseSchema.parse({ data: [null] })).toMatchObject({
      data: [],
      skippedModelCount: 1,
    });
  });

  it.each([null, undefined, 'next-page'])(
    'accepts Gemini pagination marker %s',
    (nextPageToken) => {
      expect(
        GeminiModelsResponseSchema.parse({
          models: [
            { name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] },
          ],
          nextPageToken,
        }),
      ).toEqual({
        models: [{ name: 'models/gemini-3-pro', supportedGenerationMethods: ['generateContent'] }],
        nextPageToken: nextPageToken ?? undefined,
      });
    },
  );
});
