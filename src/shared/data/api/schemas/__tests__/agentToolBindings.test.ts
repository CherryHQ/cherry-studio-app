import { AgentToolBindingSchema } from '@/shared/data/types/agentToolBinding';

import { ReplaceAgentToolBindingsSchema, WriteAgentToolBindingSchema } from '../agentToolBindings';

const SERVER_ID = '00000000-0000-4000-8000-000000000003';

describe('Agent tool binding Data API schemas', () => {
  it('defaults new MCP bindings to ask and remains JSON-safe', () => {
    const binding = WriteAgentToolBindingSchema.parse({ serverId: SERVER_ID, source: 'mcp' });

    expect(binding).toEqual({
      approval: 'ask',
      enabled: true,
      serverId: SERVER_ID,
      source: 'mcp',
    });
    expect(WriteAgentToolBindingSchema.parse(JSON.parse(JSON.stringify(binding)))).toEqual(binding);
  });

  it('rejects built-in binding writes and responses', () => {
    const builtin = { capabilityId: 'calendar.read', source: 'builtin' };
    expect(WriteAgentToolBindingSchema.safeParse(builtin).success).toBe(false);
    expect(ReplaceAgentToolBindingsSchema.safeParse({ bindings: [builtin] }).success).toBe(false);
    expect(
      AgentToolBindingSchema.safeParse({
        ...builtin,
        agentId: '00000000-0000-4000-8000-000000000001',
        approval: 'ask',
        createdAt: '2026-08-26T00:00:00.000Z',
        displayNameSnapshot: null,
        enabled: true,
        id: '00000000-0000-4000-8000-000000000002',
        updatedAt: '2026-08-26T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('rejects capability fields on MCP bindings and MCP auto approval', () => {
    expect(
      WriteAgentToolBindingSchema.safeParse({
        capabilityId: 'calendar.read',
        serverId: SERVER_ID,
        source: 'mcp',
      }).success,
    ).toBe(false);
    expect(
      ReplaceAgentToolBindingsSchema.safeParse({
        bindings: [{ approval: 'auto', serverId: SERVER_ID, source: 'mcp' }],
      }).success,
    ).toBe(false);
  });
});
