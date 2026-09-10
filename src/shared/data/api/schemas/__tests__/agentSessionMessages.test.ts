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

  test.each([
    { aroundMessageId: 'message', cursor: '100:message' },
    { aroundMessageId: 'message', direction: 'newer' },
    { direction: 'newer' },
    { aroundMessageId: '' },
    { limit: 201 },
  ])('rejects ambiguous or unbounded query %j', (query) => {
    expect(ListAgentSessionMessagesQuerySchema.safeParse(query).success).toBe(false);
  });
});
