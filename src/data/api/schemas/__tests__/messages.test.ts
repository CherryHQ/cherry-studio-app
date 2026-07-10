import { CreateMessageSchema, UpdateMessageSchema } from '../messages';

describe('message API schemas', () => {
  test('reject message-scoped trace ids because traces belong to topics', () => {
    expect(
      CreateMessageSchema.safeParse({
        data: { parts: [] },
        role: 'user',
        traceId: '000102030405060708090a0b0c0d0e0f',
      }).success,
    ).toBe(false);
    expect(
      UpdateMessageSchema.safeParse({
        traceId: '000102030405060708090a0b0c0d0e0f',
      }).success,
    ).toBe(false);
  });
});
