import { useQuery } from '@tanstack/react-query';

import { queryKeys, useBackendModule } from '@/frontend/data';
import type { McpServer } from '@/shared/data/types/mcpServer';

/** The tools a server exposes, shared by the editor's summary row and the tools page. */
export function useMcpServerTools(server: McpServer | undefined) {
  const mcp = useBackendModule('mcp');

  return useQuery({
    enabled:
      server !== undefined &&
      (server.origin === 'builtin' || /^https?:\/\//i.test(server.endpointUrl ?? '')),
    queryFn: () => mcp.listTools(server!.id),
    queryKey: queryKeys.mcpServers.tools(server?.id ?? ''),
    retry: false,
  });
}
