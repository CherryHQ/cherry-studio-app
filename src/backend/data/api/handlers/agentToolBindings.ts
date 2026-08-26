import type { AgentToolBindingService } from '@/backend/data/services/AgentToolBindingService';
import { toDataApiError } from '@/shared/data/api/errors';
import {
  type AgentToolBindingSchemas,
  ReplaceAgentToolBindingsSchema,
  WriteAgentToolBindingSchema,
} from '@/shared/data/api/schemas/agentToolBindings';
import type { HandlersFor } from '@/shared/data/api/types';

type AgentToolBindingData = Pick<AgentToolBindingService, 'delete' | 'list' | 'replace' | 'upsert'>;

export function createAgentToolBindingHandlers(
  service: AgentToolBindingData,
): HandlersFor<AgentToolBindingSchemas> {
  return {
    '/agents/:agentId/tool-bindings': {
      GET: ({ params }) => service.list(params.agentId),
      POST: async ({ body, params }) => {
        const parsed = WriteAgentToolBindingSchema.safeParse(body);
        if (!parsed.success) {
          throw toDataApiError(parsed.error, 'Agent tool binding upsert');
        }
        return service.upsert(params.agentId, parsed.data);
      },
      PUT: async ({ body, params }) => {
        const parsed = ReplaceAgentToolBindingsSchema.safeParse(body);
        if (!parsed.success) {
          throw toDataApiError(parsed.error, 'Agent tool binding replace');
        }
        return service.replace(params.agentId, parsed.data);
      },
    },
    '/agents/:agentId/tool-bindings/:bindingId': {
      DELETE: ({ params }) => service.delete(params.agentId, params.bindingId),
    },
  };
}
