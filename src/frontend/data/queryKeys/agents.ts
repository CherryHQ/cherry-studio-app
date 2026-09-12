import type { ListAgentsQueryParams } from '@/shared/data/api/schemas/agents';

export const agentQueryKeys = {
  all: () => ['/agents'] as const,
  detail: (agentId: string) => [`/agents/${agentId}`] as const,
  list: (params: ListAgentsQueryParams = {}) => ['/agents', params] as const,
  toolBindings: (agentId: string) => [`/agents/${agentId}/tool-bindings`] as const,
};
