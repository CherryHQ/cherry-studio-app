import * as z from 'zod';

export const McpServerIdSchema = z.uuidv4();

export const McpConfigSampleSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
});
export type McpConfigSample = z.infer<typeof McpConfigSampleSchema>;

export const McpServerTypeSchema = z.enum(['stdio', 'sse', 'streamableHttp', 'inMemory']);
export type McpServerType = z.infer<typeof McpServerTypeSchema>;

export const McpServerInstallSourceSchema = z.enum(['builtin', 'manual', 'protocol', 'unknown']);
export type McpServerInstallSource = z.infer<typeof McpServerInstallSourceSchema>;

/**
 * Mobile projection of a Streamable HTTP row in the desktop-compatible table.
 *
 * `disabledTools` excludes tools from chat injection; `disabledAutoApproveTools`
 * requires an approval prompt before matched tools run.
 */
export const McpServerSchema = z.strictObject({
  /** Empty only for an incomplete synchronized row waiting to be configured. */
  baseUrl: z.string(),
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
  type: z.literal('streamableHttp'),
  updatedAt: z.iso.datetime(),
});
export type McpServer = z.infer<typeof McpServerSchema>;

export type McpToolSource = {
  rawName: string;
  serverId: string;
  serverName?: string;
};

export const DEFAULT_MCP_TIMEOUT_SECONDS = 60;
