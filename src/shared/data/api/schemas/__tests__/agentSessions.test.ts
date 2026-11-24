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

  test('accepts a valid session model update and rejects invalid or mixed patches', () => {
    expect(UpdateAgentSessionSchema.parse({ model: 'provider::model' })).toEqual({
      model: 'provider::model',
    });
    expect(UpdateAgentSessionSchema.safeParse({ model: 'invalid' }).success).toBe(false);
    expect(UpdateAgentSessionSchema.safeParse({ model: null }).success).toBe(false);
    expect(
      UpdateAgentSessionSchema.safeParse({ name: 'Chat', model: 'provider::model' }).success,
    ).toBe(false);
  });
});
