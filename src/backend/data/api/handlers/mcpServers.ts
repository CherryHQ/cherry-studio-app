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
  warmToolsCache(server: McpServer): Promise<void>;
};

type McpMutationData = {
  create(input: CreateMcpServerDto): Promise<McpServer>;
  delete(id: string): Promise<void>;
  getById(id: string): Promise<McpServer>;
  update(id: string, input: UpdateMcpServerDto): Promise<McpServer>;
};

/**
 * Server mutations with their runtime side effects: a row change is only half
 * a mutation — the pooled connection and tools cache must follow the row.
 */
export function createMcpServerMutations(dependencies: {
  runtime: McpMutationRuntime;
  servers: McpMutationData;
}): McpServerMutations {
  const { runtime, servers } = dependencies;

  return {
    async createServer(input) {
      const server = await servers.create(input);
      if (server.isEnabled) {
        void runtime.warmToolsCache(server);
      }
      return server;
    },

    async removeServer(id) {
      await servers.delete(id);
      runtime.invalidateServer(id);
    },

    async updateServer(id, input) {
      if (!id) {
        throw new Error('updateServer requires a server id');
      }

      const previous = hasRuntimeRelevantPatch(input) ? await servers.getById(id) : undefined;
      const server = await servers.update(id, input);

      let toolsChanged = false;
      if (previous) {
        const endpointChanged = previous.endpointUrl !== server.endpointUrl;
        toolsChanged = endpointChanged;
        const becameEnabled = !previous.isEnabled && server.isEnabled;
        const becameDisabled = previous.isEnabled && !server.isEnabled;

        if (endpointChanged) {
          runtime.invalidateServer(id);
        } else if (becameDisabled) {
          runtime.invalidateServer(id, { preserveSnapshot: true });
        }

        if (server.isEnabled && (endpointChanged || becameEnabled)) {
          void runtime.warmToolsCache(server);
        }
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
