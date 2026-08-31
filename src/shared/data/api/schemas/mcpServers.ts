import * as z from 'zod';

import type { McpServer } from '@/shared/data/types/mcpServer';
import { McpServerSchema } from '@/shared/data/types/mcpServer';

const MCP_SERVER_MUTABLE_FIELDS = {
  disabledTools: true,
  endpointUrl: true,
  headers: true,
  isEnabled: true,
  name: true,
} as const;

export const CreateMcpServerSchema = McpServerSchema.pick(MCP_SERVER_MUTABLE_FIELDS)
  .partial()
  .required({ endpointUrl: true, name: true })
  .strict();
export type CreateMcpServerDto = z.infer<typeof CreateMcpServerSchema>;

export const UpdateMcpServerSchema = McpServerSchema.pick(MCP_SERVER_MUTABLE_FIELDS)
  .partial()
  .strict();
export type UpdateMcpServerDto = z.infer<typeof UpdateMcpServerSchema>;

export const ListMcpServersQuerySchema = z.strictObject({
  isEnabled: z.boolean().optional(),
});
export type ListMcpServersQueryParams = z.input<typeof ListMcpServersQuerySchema>;

export type McpUpdateServerResult = {
  server: McpServer;
  toolsChanged: boolean;
};

export type McpServerSchemas = {
  '/mcp-servers': {
    GET: {
      query?: ListMcpServersQueryParams;
      response: { items: McpServer[]; total: number };
    };
    POST: {
      body: CreateMcpServerDto;
      response: McpServer;
    };
  };
  '/mcp-servers/:id': {
    DELETE: {
      params: { id: string };
      response: undefined;
    };
    GET: {
      params: { id: string };
      response: McpServer;
    };
    PATCH: {
      body: UpdateMcpServerDto;
      params: { id: string };
      response: McpUpdateServerResult;
    };
  };
};
