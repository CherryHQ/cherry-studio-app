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
  ])('rejects ambiguous or unbounded query %j', (query) => {
    expect(ListAgentSessionMessagesQuerySchema.safeParse(query).success).toBe(false);
  });
});
