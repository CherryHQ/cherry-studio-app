import type { McpServerService } from '@/backend/data/services/McpServerService';
import type {
  CreateMcpServerDto,
  McpServerSchemas,
  McpUpdateServerResult,
  UpdateMcpServerDto,
} from '@/shared/data/api/schemas/mcpServers';
import type { HandlersFor } from '@/shared/data/api/types';
import type { McpServer } from '@/shared/data/types/mcpServer';
import { isSameMcpConnectionConfig } from '@/shared/utils/mcpConnectionConfig';

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
 * Connection release lives here. A changed URL or request header retires the
 * authenticated client immediately, so an already approved tool cannot run
 * against credentials different from the catalog it came from.
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
      const toolsChanged = previous ? !isSameMcpConnectionConfig(previous, server) : false;
      if (toolsChanged) {
        runtime.invalidateServer(id);
      } else if (previous?.isEnabled && !server.isEnabled) {
        // The snapshot outlives the connection so the settings row can still
        // report what the server last offered.
        runtime.invalidateServer(id, { preserveSnapshot: true });
      }

      return { server, toolsChanged };
    },
  };
}

function hasRuntimeRelevantPatch(input: UpdateMcpServerDto): boolean {
  return (
    input.endpointUrl !== undefined || input.headers !== undefined || input.isEnabled !== undefined
  );
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
