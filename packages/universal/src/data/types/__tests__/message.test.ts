import { ContentMessageRoleSchema, MessageSnapshotSchema, MessageStatusSchema } from '../message';

describe('message presentation contracts', () => {
  test('keeps only content roles used by Agent Session search', () => {
    expect(ContentMessageRoleSchema.options).toEqual(['user', 'assistant', 'system']);
  });

  test('accepts statuses projected by the shared message renderer', () => {
    expect(MessageStatusSchema.safeParse('success').success).toBe(true);
    expect(MessageStatusSchema.safeParse('cancelled').success).toBe(false);
  });

  test('validates model snapshots without legacy tree fields', () => {
    expect(
      MessageSnapshotSchema.parse({
        id: 'agent-1',
        model: { id: 'provider::model', name: 'Model', provider: 'Provider' },
        name: 'Agent',
      }),
    ).toBeDefined();
  });
});
