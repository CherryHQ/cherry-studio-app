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
    expect(UpdateAgentSessionSchema.parse({ name: '  Renamed  ' })).toEqual({
      name: 'Renamed',
    });
    expect(UpdateAgentSessionSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(UpdateAgentSessionSchema.safeParse({ name: 'Chat', unknown: true }).success).toBe(false);
  });
});
