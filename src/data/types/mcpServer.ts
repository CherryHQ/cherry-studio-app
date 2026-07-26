import * as z from 'zod';

export const McpServerIdSchema = z.uuidv4();

/**
 * Remote MCP server (Streamable HTTP transport only on mobile).
 *
 * `disabledTools` excludes tools from chat injection; `disabledAutoApproveTools`
 * requires an approval prompt before matched tools run.
 */
export const McpServerSchema = z.strictObject({
  baseUrl: z.url(),
  createdAt: z.iso.datetime(),
  description: z.string(),
  disabledAutoApproveTools: z.array(z.string()),
  disabledTools: z.array(z.string()),
  headers: z.record(z.string(), z.string()),
  id: McpServerIdSchema,
  isActive: z.boolean(),
  name: z.string().min(1),
  /** Tool-call timeout in seconds; null = default (60s) */
  timeout: z.number().int().positive().nullable(),
  updatedAt: z.iso.datetime(),
});
export type McpServer = z.infer<typeof McpServerSchema>;

export type McpToolSource = {
  rawName: string;
  serverId: string;
  serverName?: string;
};

export const DEFAULT_MCP_TIMEOUT_SECONDS = 60;
