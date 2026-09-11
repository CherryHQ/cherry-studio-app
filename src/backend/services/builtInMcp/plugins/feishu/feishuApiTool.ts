import type { ListToolsResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import type { HttpQuery } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

export type FeishuApiRequest = {
  path: `/open-apis/${string}`;
  query?: HttpQuery;
} & ({ method: 'GET'; body?: never } | { method: 'POST' | 'PUT' | 'PATCH'; body?: unknown });

export type FeishuToolAccess = 'read' | 'write';
export type FeishuApiTool = {
  access: FeishuToolAccess;
  scopes: readonly string[];
  definition: ListToolsResult['tools'][number];
  request(input: Record<string, unknown>): FeishuApiRequest;
};

/** One declaration owns discovery, validation, permissions and the fixed API operation. */
export function defineFeishuApiTool<TInput>(tool: {
  name: string;
  description: string;
  access: FeishuToolAccess;
  scopes: readonly string[];
  input: z.ZodType<TInput>;
  request(input: TInput): FeishuApiRequest;
}): FeishuApiTool {
  const { $schema: _schema, ...schema } = z.toJSONSchema(tool.input, { target: 'draft-7' });
  return {
    access: tool.access,
    scopes: tool.scopes,
    definition: {
      name: tool.name,
      description: tool.description,
      inputSchema: { ...schema, type: 'object' },
      annotations: {
        readOnlyHint: tool.access === 'read',
        destructiveHint: tool.access === 'write',
      },
    },
    request(input) {
      const parsed = tool.input.safeParse(input);
      if (!parsed.success)
        throw new PluginError('request', `Invalid arguments for Feishu tool ${tool.name}.`);
      return tool.request(parsed.data);
    },
  };
}

export const FeishuIdSchema = z
  .string()
  .max(512)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@:-]*$/);
export const FeishuOpenIdSchema = z
  .string()
  .max(100)
  .regex(/^ou_[a-zA-Z0-9]+$/);
export const FeishuPageShape = {
  page_size: z.number().int().min(1).max(100).optional().describe('Page size, 1–100; default 20.'),
  page_token: z
    .string()
    .min(1)
    .max(4096)
    .optional()
    .describe('Continuation token from the previous page.'),
};

export const FeishuSecondsSchema = z
  .string()
  .regex(/^[0-9]{1,11}$/)
  .describe('Unix timestamp in seconds, not milliseconds.');
export const FeishuMillisecondsSchema = z
  .string()
  .regex(/^[0-9]{1,15}$/)
  .describe('Unix timestamp in milliseconds.');
