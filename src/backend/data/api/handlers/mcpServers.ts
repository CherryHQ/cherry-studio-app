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
