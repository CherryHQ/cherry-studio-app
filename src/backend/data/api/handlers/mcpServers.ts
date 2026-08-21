import type { McpServerService } from '@/backend/data/services/McpServerService';
import type {
  CreateMcpServerDto,
  McpServerSchemas,
  McpUpdateServerResult,
  UpdateMcpServerDto,
} from '@/shared/data/api/schemas/mcpServers';
import type { HandlersFor } from '@/shared/data/api/types';
import type { McpServer } from '@/shared/data/types/mcpServer';

export type McpServerMutations = {
  createServer(input: CreateMcpServerDto): Promise<McpServer>;
  removeServer(id: string): Promise<void>;
  updateServer(id: string, input: UpdateMcpServerDto): Promise<McpUpdateServerResult>;
};

type McpMutationRuntime = {
  invalidateServer(serverId: string, options?: { preserveSnapshot?: boolean }): void;
};

type McpMutationData = Pick<McpServerService, 'create' | 'delete' | 'getById' | 'update'>;

/**
 * Server mutations with the runtime side effects a row change cannot express.
 *
 * Only connection release lives here. A changed URL needs no notification: the
 * runtime keys its pooled client on the endpoint, so the next read retires the
 * old one on its own. A deleted or disabled server never gets that next read,
 * which is why those two have to say so.
 */
export function createMcpServerMutations(dependencies: {
  runtime: McpMutationRuntime;
  servers: McpMutationData;
}): McpServerMutations {
  const { runtime, servers } = dependencies;

  return {
    createServer(input) {
      return servers.create(input);
    },

    async removeServer(id) {
      await servers.delete(id);
      runtime.invalidateServer(id);
    },

    async updateServer(id, input) {
      const previous = hasRuntimeRelevantPatch(input) ? await servers.getById(id) : undefined;
      const server = await servers.update(id, input);

      // Reported so the client can drop its own cached tool list for this row.
      const toolsChanged = previous ? previous.endpointUrl !== server.endpointUrl : false;
      if (previous?.isEnabled && !server.isEnabled) {
        // The snapshot outlives the connection so the settings row can still
        // report what the server last offered.
        runtime.invalidateServer(id, { preserveSnapshot: true });
      }

      return { server, toolsChanged };
    },
  };
}

function hasRuntimeRelevantPatch(input: UpdateMcpServerDto): boolean {
  return input.endpointUrl !== undefined || input.isEnabled !== undefined;
}

export function createMcpServerHandlers(
  service: McpServerService,
  mutations: McpServerMutations,
): HandlersFor<McpServerSchemas> {
  return {
    '/mcp-servers': {
      GET: ({ query }) => service.list(query),
      POST: ({ body }) => mutations.createServer(body),
    },
    '/mcp-servers/:id': {
      DELETE: ({ params }) => mutations.removeServer(params.id),
      GET: ({ params }) => service.getById(params.id),
      PATCH: ({ body, params }) => mutations.updateServer(params.id, body),
    },
  };
}
