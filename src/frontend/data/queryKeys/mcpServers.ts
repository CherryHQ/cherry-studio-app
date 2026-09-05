export const mcpServerQueryKeys = {
  all: () => ['/mcp-servers'] as const,
  detail: (serverId: string) => [`/mcp-servers/${serverId}`] as const,
  list: (params: { isEnabled?: boolean } = {}) => ['/mcp-servers', params] as const,
  runtimeSummaries: (servers: readonly { id: string; isEnabled: boolean; updatedAt: string }[]) => [
    '/mcp-servers',
    'runtime-summaries',
    servers.map((server) => [server.id, server.isEnabled, server.updatedAt]),
  ],
  tools: (serverId: string) => [`/mcp-servers/${serverId}/tools`] as const,
};
