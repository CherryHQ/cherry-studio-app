import { CreateModelSchema, UpdateModelSchema } from '../models';

describe('model limit overrides', () => {
  it('allows updates to reset each token limit without touching other fields', () => {
    expect(
      UpdateModelSchema.parse({ contextWindow: null, maxInputTokens: null, maxOutputTokens: null }),
    ).toEqual({ contextWindow: null, maxInputTokens: null, maxOutputTokens: null });
    expect(UpdateModelSchema.parse({ name: 'My model' })).toEqual({ name: 'My model' });
  });

  it('keeps creation limits optional and rejects invalid nonempty limits', () => {
    expect(
      CreateModelSchema.safeParse({ providerId: 'custom', modelId: 'model', contextWindow: null })
        .success,
    ).toBe(false);
    for (const value of [0, -1, 1.5, Infinity]) {
      expect(UpdateModelSchema.safeParse({ maxOutputTokens: value }).success).toBe(false);
    }
  });
});
