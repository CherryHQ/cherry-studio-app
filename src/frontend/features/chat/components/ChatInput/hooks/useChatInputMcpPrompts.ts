import { useAgentToolBindingsApi } from '@/frontend/hooks/agent';
import { useCachedMcpPrompts, useMcpServersApi } from '@/frontend/hooks/mcp/useMcpServers';

import { getChatInputMcpPrompts } from '../utils/chatInputMcpPrompts';

export function useChatInputMcpPrompts(agentId: string | undefined) {
  const enabled = Boolean(agentId);
  const { bindings } = useAgentToolBindingsApi(agentId);
  const { servers } = useMcpServersApi({ enabled });
  const catalogs = useCachedMcpPrompts({ enabled });
  return agentId ? getChatInputMcpPrompts(servers, bindings, catalogs) : [];
}
