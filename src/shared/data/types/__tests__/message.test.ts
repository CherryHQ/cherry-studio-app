import { type MessageData, MessageDataSchema, MessageIdSchema } from '../message';

describe('MessageDataSchema', () => {
  test('accepts parts-only message data', () => {
    const data: MessageData = {
      parts: [{ state: 'done', text: 'hello parts', type: 'text' }],
    };

    expect(MessageDataSchema.safeParse(data).success).toBe(true);
  });
});

describe('MessageIdSchema', () => {
  test('accepts any UUID version and rejects non-UUID IDs', () => {
    expect(MessageIdSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
    expect(MessageIdSchema.safeParse('018f6de0-7a89-7cc5-98ee-2d6f24ec9b1b').success).toBe(true);
    expect(MessageIdSchema.safeParse('mock-message-id').success).toBe(false);
  });
});
