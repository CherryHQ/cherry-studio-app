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

  it('rejects source-field mixing and MCP auto approval', () => {
    expect(
      WriteAgentToolBindingSchema.safeParse({
        capabilityId: 'calendar.read',
        serverId: SERVER_ID,
        source: 'builtin',
      }).success,
    ).toBe(false);
    expect(
      ReplaceAgentToolBindingsSchema.safeParse({
        bindings: [{ approval: 'auto', serverId: SERVER_ID, source: 'mcp' }],
      }).success,
    ).toBe(false);
  });
});
