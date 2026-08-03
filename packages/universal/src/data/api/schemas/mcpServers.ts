import type { StreamableHttpMcpServer } from '@shared/data/types/mcpServer';
import { McpServerSchema } from '@shared/data/types/mcpServer';
import * as z from 'zod';

const MCP_SERVER_MUTABLE_FIELDS = {
  baseUrl: true,
  description: true,
  disabledAutoApproveTools: true,
  disabledTools: true,
  headers: true,
  isActive: true,
  name: true,
  timeout: true,
} as const;

export const CreateMcpServerSchema = McpServerSchema.pick(MCP_SERVER_MUTABLE_FIELDS)
  .partial()
  .required({ baseUrl: true, name: true })
  .extend({
    baseUrl: z.url(),
    timeout: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type CreateMcpServerDto = z.infer<typeof CreateMcpServerSchema>;

export const UpdateMcpServerSchema = McpServerSchema.pick(MCP_SERVER_MUTABLE_FIELDS)
  .partial()
  .extend({
    baseUrl: z.url().optional(),
    timeout: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type UpdateMcpServerDto = z.infer<typeof UpdateMcpServerSchema>;

export const ListMcpServersQuerySchema = z.strictObject({
  isActive: z.boolean().optional(),
});
export type ListMcpServersQueryParams = z.input<typeof ListMcpServersQuerySchema>;

export type McpUpdateServerResult = {
  server: StreamableHttpMcpServer;
  toolsChanged: boolean;
};

export type McpServerSchemas = {
  '/mcp-servers': {
    GET: {
      query?: ListMcpServersQueryParams;
      response: { items: StreamableHttpMcpServer[]; total: number };
    };
    POST: {
      body: CreateMcpServerDto;
      response: StreamableHttpMcpServer;
    };
  };
  '/mcp-servers/:id': {
    DELETE: {
      params: { id: string };
      response: undefined;
    };
    GET: {
      params: { id: string };
      response: StreamableHttpMcpServer;
    };
    PATCH: {
      body: UpdateMcpServerDto;
      params: { id: string };
      response: McpUpdateServerResult;
    };
  };
};
