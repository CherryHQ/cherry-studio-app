import type { ListAssistantsQueryParams } from '@/shared/data/api/schemas/assistants';

export const assistantQueryKeys = {
  all: () => ['/assistants'] as const,
  detail: (assistantId: string) => [`/assistants/${assistantId}`] as const,
  list: (params: ListAssistantsQueryParams = {}) => ['/assistants', params] as const,
};
