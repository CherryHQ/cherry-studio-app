import {
  CreateMcpServerSchema,
  UpdateMcpServerSchema,
} from '@/shared/contracts/schemas/mcpServers';

describe('mobile MCP server DTO schemas', () => {
  it('accepts only the remote fields mobile owns', () => {
    expect(
      CreateMcpServerSchema.parse({
        baseUrl: 'https://example.com/mcp',
        disabledAutoApproveTools: ['write'],
        disabledTools: ['delete'],
        headers: { Authorization: 'Bearer token' },
        isActive: false,
        name: 'Example',
        timeout: null,
      }),
    ).toEqual({
      baseUrl: 'https://example.com/mcp',
      disabledAutoApproveTools: ['write'],
      disabledTools: ['delete'],
      headers: { Authorization: 'Bearer token' },
      isActive: false,
      name: 'Example',
      timeout: null,
    });
  });

  it.each([
    'type',
    'provider',
    'dxtVersion',
    'sortOrder',
    'installSource',
    'isTrusted',
  ])('rejects the synchronized desktop-only field %s', (field) => {
    expect(() =>
      UpdateMcpServerSchema.parse({
        [field]: field === 'isTrusted' ? true : 'desktop-value',
      }),
    ).toThrow();
  });
});
