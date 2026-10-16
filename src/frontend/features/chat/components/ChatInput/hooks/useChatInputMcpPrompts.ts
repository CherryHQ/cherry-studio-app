import { useAgentToolBindingsApi } from '@/frontend/hooks/agent';
import { useCachedMcpPrompts, useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';

import { getChatInputMcpPrompts } from '../utils/chatInputMcpPrompts';

export function useChatInputMcpPrompts(agentId: string | undefined) {
  const { bindings } = useAgentToolBindingsApi(agentId);
  const { servers } = useMcpServersApi();
  const catalogs = useCachedMcpPrompts();
  return agentId ? getChatInputMcpPrompts(servers, bindings, catalogs) : [];
}
