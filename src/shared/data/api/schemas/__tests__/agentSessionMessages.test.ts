import { ListAgentSessionMessagesQuerySchema } from '../agentSessionMessages';

describe('message window query contract', () => {
  test('accepts an initial target window and directional continuation separately', () => {
    expect(
      ListAgentSessionMessagesQuerySchema.parse({ aroundMessageId: 'message', limit: '12' }),
    ).toEqual({ aroundMessageId: 'message', limit: 12 });
    expect(
      ListAgentSessionMessagesQuerySchema.parse({ cursor: '100:message', direction: 'newer' }),
    ).toEqual({ cursor: '100:message', direction: 'newer' });
  });

  test('accepts a bounded ID selection without pagination options', () => {
    expect(ListAgentSessionMessagesQuerySchema.parse({ ids: 'message' })).toEqual({
      ids: ['message'],
    });
    const ids = Array.from({ length: 200 }, (_, index) => `message-${index}`);
    expect(ListAgentSessionMessagesQuerySchema.parse({ ids })).toEqual({ ids });
  });

  test.each([true, false])(
    'preserves settledOnly=%s in a serialized window request',
    (settledOnly) => {
      const query = { limit: 12, settledOnly };
      expect(ListAgentSessionMessagesQuerySchema.parse(JSON.parse(JSON.stringify(query)))).toEqual(
        query,
      );
    },
  );

  test.each([
    { aroundMessageId: 'message', cursor: '100:message' },
    { aroundMessageId: 'message', direction: 'newer' },
    { direction: 'newer' },
    { aroundMessageId: '' },
    { limit: 201 },
    { ids: [] },
    { ids: [''] },
    { ids: Array.from({ length: 201 }, (_, index) => `message-${index}`) },
    { ids: ['message'], cursor: '100:message' },
    { ids: ['message'], direction: 'older' },
    { ids: ['message'], aroundMessageId: 'message' },
    { ids: ['message'], limit: 1 },
    { ids: ['message'], settledOnly: true },
    { settledOnly: 'false' },
  ])('rejects ambiguous or unbounded query %j', (query) => {
    expect(ListAgentSessionMessagesQuerySchema.safeParse(query).success).toBe(false);
  });
});

test('exact around mode requires a single around target and preserves limits', () => {
  expect(
    ListAgentSessionMessagesQuerySchema.parse({
      aroundMessageId: 'source',
      aroundMode: 'exact',
      limit: 200,
    }),
  ).toEqual({ aroundMessageId: 'source', aroundMode: 'exact', limit: 200 });
  for (const query of [
    { aroundMode: 'exact' },
    { aroundMode: 'exact', ids: ['source'] },
    { aroundMode: 'exact', aroundMessageId: 'source', cursor: 'cursor' },
    { aroundMode: 'exact', aroundMessageId: 'source', direction: 'older' },
    { aroundMode: 'exact', aroundMessageId: 'source', limit: 201 },
  ])
    expect(ListAgentSessionMessagesQuerySchema.safeParse(query).success).toBe(false);
});
