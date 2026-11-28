import type { AgentRef } from '../contracts';
import { useCatalog } from '../useConversationCatalog';
import { useRemoteConversationSource } from './useRemoteConversationSource';

export function useRemoteModels(agent: AgentRef, search: string, enabled = true) {
  const { catalog } = useRemoteConversationSource();
  return useCatalog(
    ['models', agent, search],
    (cursor, signal) => catalog.listModels(agent, search, cursor, signal),
    enabled,
  );
}
