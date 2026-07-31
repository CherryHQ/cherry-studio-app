import { CreateTagSchema, SyncEntityTagsSchema, TagColorSchema } from '../tag';

describe('tag data schemas', () => {
  test('validates display colors as full hex colors', () => {
    expect(TagColorSchema.safeParse('#A1b2C3').success).toBe(true);
    expect(TagColorSchema.safeParse('A1b2C3').success).toBe(false);
    expect(TagColorSchema.safeParse('#abc').success).toBe(false);
  });

  test('trims and requires tag names', () => {
    expect(CreateTagSchema.parse({ name: ' work ' }).name).toBe('work');
    expect(CreateTagSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  test('rejects duplicate tag bindings in direct sync payloads', () => {
    const tagId = '550e8400-e29b-41d4-a716-446655440000';

    expect(SyncEntityTagsSchema.safeParse({ tagIds: [tagId, tagId] }).success).toBe(false);
  });
});
