import { CreateMcpServerSchema, UpdateMcpServerSchema } from '@/shared/data/api/schemas/mcpServers';

describe('MCP server DTO schemas', () => {
  it('creates from an endpoint and a name, with the enable switch optional', () => {
    expect(
      CreateMcpServerSchema.parse({
        endpointUrl: 'https://example.com/mcp',
        isEnabled: true,
        name: 'Example',
      }),
    ).toEqual({
      endpointUrl: 'https://example.com/mcp',
      isEnabled: true,
      name: 'Example',
    });
    expect(
      CreateMcpServerSchema.parse({ endpointUrl: 'https://example.com/mcp', name: 'Example' }),
    ).toEqual({ endpointUrl: 'https://example.com/mcp', name: 'Example' });
    expect(() => CreateMcpServerSchema.parse({ name: 'No endpoint' })).toThrow();
  });

  it.each(['type', 'timeout', 'disabledAutoApproveTools', 'isActive'])(
    'rejects the removed field %s',
    (field) => {
      expect(() => UpdateMcpServerSchema.parse({ [field]: 'value' })).toThrow();
    },
  );

  it('accepts string HTTP headers on create and update', () => {
    const headers = { Authorization: 'Bearer token' };

    expect(
      CreateMcpServerSchema.parse({
        endpointUrl: 'https://example.com/mcp',
        headers,
        name: 'Example',
      }),
    ).toEqual({ endpointUrl: 'https://example.com/mcp', headers, name: 'Example' });
    expect(UpdateMcpServerSchema.parse({ headers })).toEqual({ headers });
  });

  it('patches the tool rules as a whole list', () => {
    expect(UpdateMcpServerSchema.parse({ disabledTools: ['search'] })).toEqual({
      disabledTools: ['search'],
    });
    expect(UpdateMcpServerSchema.parse({ disabledTools: [] })).toEqual({ disabledTools: [] });
  });
});
