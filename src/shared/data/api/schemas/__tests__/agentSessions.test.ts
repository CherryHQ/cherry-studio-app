import { ListAgentSessionMessagesQuerySchema } from '../agentSessionMessages';
import { ListAgentSessionsQuerySchema, UpdateAgentSessionSchema } from '../agentSessions';

describe('agent session api schemas', () => {
  test('coerces cursor page limits and enforces their shared maximum', () => {
    expect(ListAgentSessionsQuerySchema.parse({ limit: '25' })).toEqual({ limit: 25 });
    expect(ListAgentSessionMessagesQuerySchema.parse({ limit: '50' })).toEqual({ limit: 50 });
    expect(ListAgentSessionsQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(ListAgentSessionMessagesQuerySchema.safeParse({ limit: 201 }).success).toBe(false);
  });

  test('normalizes a manual title and rejects empty or unknown fields', () => {
    expect(UpdateAgentSessionSchema.parse({ title: '  Renamed  ' })).toEqual({
      title: 'Renamed',
    });
    expect(UpdateAgentSessionSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(UpdateAgentSessionSchema.safeParse({ title: 'Chat', unknown: true }).success).toBe(
      false,
    );
  });
});
