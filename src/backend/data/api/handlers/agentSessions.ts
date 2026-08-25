import type { AgentSessionService } from '@/backend/data/services/AgentSessionService';
import { AgentProtocolError, type AgentSessionView } from '@/shared/contracts/agent';
import { DataApiErrorFactory, toDataApiError } from '@/shared/data/api/errors';
import {
  type AgentSessionSchemas,
  ListAgentSessionsQuerySchema,
  UpdateAgentSessionSchema,
} from '@/shared/data/api/schemas/agentSessions';
import type { HandlersFor } from '@/shared/data/api/types';

export type AgentSessionMutations = {
  deleteSession(input: { sessionId: string }): Promise<void>;
  renameSession(input: { sessionId: string; title: string }): Promise<AgentSessionView>;
};

async function runSessionMutation<T>(sessionId: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AgentProtocolError && error.view.code === 'SESSION_NOT_FOUND') {
      throw DataApiErrorFactory.notFound('AgentSession', sessionId);
    }
    throw toDataApiError(error, 'Agent Session mutation');
  }
}

export function createAgentSessionHandlers(
  service: AgentSessionService,
  mutations: AgentSessionMutations,
): HandlersFor<AgentSessionSchemas> {
  return {
    '/agent-sessions': {
      GET: async ({ query }) =>
        service.listByCursor(ListAgentSessionsQuerySchema.parse(query ?? {})),
    },
    '/agent-sessions/:id': {
      DELETE: async ({ params }) => {
        await runSessionMutation(params.id, () =>
          mutations.deleteSession({ sessionId: params.id }),
        );
      },
      GET: async ({ params }) => service.getById(params.id),
      PATCH: async ({ body, params }) => {
        const { title } = UpdateAgentSessionSchema.parse(body);
        await runSessionMutation(params.id, () =>
          mutations.renameSession({ sessionId: params.id, title }),
        );
        return service.getById(params.id);
      },
    },
  };
}
