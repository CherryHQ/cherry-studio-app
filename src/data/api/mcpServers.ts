export const mcpServerQueryKeys = {
  all: () => ['/mcp-servers'] as const,
  detail: (serverId: string) => [`/mcp-servers/${serverId}`] as const,
  list: (params: { isActive?: boolean } = {}) => ['/mcp-servers', params] as const,
  tools: (serverId: string) => [`/mcp-servers/${serverId}/tools`] as const,
};
