import type {
  CreateMcpServerDto,
  McpServerSchemas,
  McpUpdateServerResult,
  UpdateMcpServerDto,
} from '@cherrystudio/universal/data/api/schemas/mcpServers';
import type { HandlersFor } from '@cherrystudio/universal/data/api/types';
import type { StreamableHttpMcpServer } from '@cherrystudio/universal/data/types/mcpServer';

import type { McpServerService } from '@/backend/data/services/McpServerService';

export type McpServerMutations = {
  createServer(input: CreateMcpServerDto): Promise<StreamableHttpMcpServer>;
  removeServer(id: string): Promise<void>;
  updateServer(id: string, input: UpdateMcpServerDto): Promise<McpUpdateServerResult>;
};

export function createMcpServerHandlers(
  service: McpServerService,
  mutations: McpServerMutations,
): HandlersFor<McpServerSchemas> {
  return {
    '/mcp-servers': {
      GET: ({ query }) => service.list({ ...query, type: 'streamableHttp' }),
      POST: ({ body }) => mutations.createServer(body),
    },
    '/mcp-servers/:id': {
      DELETE: ({ params }) => mutations.removeServer(params.id),
      GET: ({ params }) => service.getById(params.id, 'streamableHttp'),
      PATCH: ({ body, params }) => mutations.updateServer(params.id, body),
    },
  };
}
