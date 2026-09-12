import {
  createUniqueModelId,
  isUniqueModelId,
  UniqueModelIdSchema,
} from '@shared/data/types/model';

describe('model ids', () => {
  test('creates and validates strict unique model ids', () => {
    const id = createUniqueModelId('openai', 'gpt-4o');

    expect(id).toBe('openai::gpt-4o');
    expect(UniqueModelIdSchema.safeParse(id).success).toBe(true);
    expect(isUniqueModelId(id)).toBe(true);
  });

  test('rejects empty parts and route-reserved model ids', () => {
    expect(() => createUniqueModelId('', 'gpt-4o')).toThrow('providerId cannot be empty');
    expect(() => createUniqueModelId('openai', '')).toThrow('modelId cannot be empty');
    expect(() => createUniqueModelId('openai', 'gpt?4o')).toThrow(
      'modelId cannot contain reserved route character "?"',
    );

    expect(UniqueModelIdSchema.safeParse('::gpt-4o').success).toBe(false);
    expect(UniqueModelIdSchema.safeParse('openai::').success).toBe(false);
    expect(UniqueModelIdSchema.safeParse('openai::gpt#4o').success).toBe(false);
  });
});
