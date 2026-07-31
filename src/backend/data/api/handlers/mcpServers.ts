import type {
  CreateMcpServerDto,
  ListMcpServersQueryParams,
  McpServerSchemas,
  McpUpdateServerResult,
  UpdateMcpServerDto,
} from '@/shared/data/api/schemas/mcpServers';
import type { HandlersFor, OffsetPaginationResponse } from '@/shared/data/api/types';
import type { StreamableHttpMcpServer } from '@/shared/data/types/mcpServer';

export type McpServerData = {
  createServer(input: CreateMcpServerDto): Promise<StreamableHttpMcpServer>;
  getServer(id: string): Promise<StreamableHttpMcpServer>;
  listServers(
    query?: ListMcpServersQueryParams,
  ): Promise<OffsetPaginationResponse<StreamableHttpMcpServer>>;
  removeServer(id: string): Promise<void>;
  updateServer(id: string, input: UpdateMcpServerDto): Promise<McpUpdateServerResult>;
};

export function createMcpServerHandlers(service: McpServerData): HandlersFor<McpServerSchemas> {
  return {
    '/mcp-servers': {
      GET: ({ query }) => service.listServers(query),
      POST: ({ body }) => service.createServer(body),
    },
    '/mcp-servers/:id': {
      DELETE: ({ params }) => service.removeServer(params.id),
      GET: ({ params }) => service.getServer(params.id),
      PATCH: ({ body, params }) => service.updateServer(params.id, body),
    },
  };
}
