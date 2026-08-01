import type { AgentService } from '@/backend/data/services/AgentService';
import type { AgentTaskService } from '@/backend/data/services/AgentTaskService';
import { DataApiErrorFactory, toDataApiError } from '@/shared/data/api/errors';
import {
  OrderBatchRequestSchema,
  OrderRequestSchema,
} from '@/shared/data/api/schemas/_endpointHelpers';
import {
  type AgentSchemas,
  DeleteAgentQuerySchema,
  ListAgentsQuerySchema,
  type ListQuery,
  ListQuerySchema,
  UpdateAgentSchema,
} from '@/shared/data/api/schemas/agents';
import type { HandlersFor } from '@/shared/data/api/types';

function pagination(query: ListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 50;
  return { limit, offset: (page - 1) * limit, page };
}

function parseList(query: unknown): ListQuery {
  const parsed = ListQuerySchema.safeParse(query ?? {});
  if (!parsed.success) throw toDataApiError(parsed.error);
  return parsed.data;
}

export function createAgentHandlers(
  agents: AgentService,
  tasks: AgentTaskService,
): HandlersFor<AgentSchemas> {
  return {
    '/agent-tasks': {
      GET: async ({ query }) => {
        const { limit, offset, page } = pagination(parseList(query));
        const result = await tasks.listAllTasks({ limit, offset });
        return { items: result.tasks, page, total: result.total };
      },
    },
    '/agent-tasks/:taskId': {
      GET: async ({ params }) => {
        const task = await tasks.getTaskById(params.taskId);
        if (!task) throw DataApiErrorFactory.notFound('Task', params.taskId);
        return task;
      },
    },
    '/agents': {
      GET: async ({ query }) => {
        const parsed = ListAgentsQuerySchema.safeParse(query ?? {});
        if (!parsed.success) throw toDataApiError(parsed.error);
        const { limit, page, search } = parsed.data;
        const result = await agents.listAgents({
          limit,
          offset: (page - 1) * limit,
          search,
        });
        return { items: result.agents, page, total: result.total };
      },
    },
    '/agents/:agentId': {
      DELETE: async ({ params, query }) => {
        const parsed = DeleteAgentQuerySchema.safeParse(query ?? {});
        if (!parsed.success) throw toDataApiError(parsed.error);
        const result = await agents.deleteAgent(params.agentId, {
          deleteSessions: parsed.data.deleteSessions === true,
        });
        if (!result.deleted) throw DataApiErrorFactory.notFound('Agent', params.agentId);
        return result;
      },
      GET: async ({ params }) => {
        const agent = await agents.getAgent(params.agentId);
        if (!agent) throw DataApiErrorFactory.notFound('Agent', params.agentId);
        return agent;
      },
      PATCH: async ({ body, params }) => {
        const parsed = UpdateAgentSchema.safeParse(body);
        if (!parsed.success) throw toDataApiError(parsed.error);
        const agent = await agents.updateAgent(params.agentId, parsed.data);
        if (!agent) throw DataApiErrorFactory.notFound('Agent', params.agentId);
        return agent;
      },
    },
    '/agents/:agentId/tasks': {
      GET: async ({ params, query }) => {
        const { limit, offset, page } = pagination(parseList(query));
        const result = await tasks.listTasks(params.agentId, { limit, offset });
        return { items: result.tasks, page, total: result.total };
      },
    },
    '/agents/:agentId/tasks/:taskId': {
      GET: async ({ params }) => {
        const task = await tasks.getTask(params.agentId, params.taskId);
        if (!task) throw DataApiErrorFactory.notFound('Task', params.taskId);
        return task;
      },
    },
    '/agents/:agentId/tasks/:taskId/logs': {
      GET: async ({ params, query }) => {
        if (!(await tasks.getTask(params.agentId, params.taskId))) {
          throw DataApiErrorFactory.notFound('Task', params.taskId);
        }
        const { limit, offset, page } = pagination(parseList(query));
        const result = await tasks.getTaskLogs(params.taskId, { limit, offset });
        return { items: result.logs, page, total: result.total };
      },
    },
    '/agents/:id/order': {
      PATCH: async ({ body, params }) => agents.reorder(params.id, OrderRequestSchema.parse(body)),
    },
    '/agents/order:batch': {
      PATCH: async ({ body }) => agents.reorderBatch(OrderBatchRequestSchema.parse(body).moves),
    },
  };
}
