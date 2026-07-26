/**
 * MCP Server entity types.
 *
 * Keep `McpServerSchema` aligned with desktop
 * `src/shared/data/types/mcpServer.ts`. Mobile-only projections and runtime
 * types live below the shared entity definition.
 */

import * as z from 'zod';

// ============================================================================
// Shared Sub-Schemas
// ============================================================================

/** MCP server configuration sample. */
export const McpConfigSampleSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
});
export type McpConfigSample = z.infer<typeof McpConfigSampleSchema>;

/** MCP Server communication protocol. */
export const McpServerTypeSchema = z.enum(['stdio', 'sse', 'streamableHttp', 'inMemory']);
export type McpServerType = z.infer<typeof McpServerTypeSchema>;

/** MCP Server install source. */
export const McpServerInstallSourceSchema = z.enum(['builtin', 'manual', 'protocol', 'unknown']);
export type McpServerInstallSource = z.infer<typeof McpServerInstallSourceSchema>;

// ============================================================================
// McpServer Entity
// ============================================================================

/**
 * Complete MCP Server entity as stored in the desktop-compatible database.
 *
 * Nullable DB columns are represented as optional (`?`); the service layer
 * converts SQL NULL to `undefined`.
 */
export const McpServerSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string().min(1),
  type: McpServerTypeSchema.optional(),
  description: z.string().optional(),
  baseUrl: z.string().optional(),
  command: z.string().optional(),
  registryUrl: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  provider: z.string().optional(),
  providerUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  longRunning: z.boolean().optional(),
  timeout: z.number().optional(),
  dxtVersion: z.string().optional(),
  dxtPath: z.string().optional(),
  reference: z.string().optional(),
  searchKey: z.string().optional(),
  configSample: McpConfigSampleSchema.optional(),
  disabledTools: z.array(z.string()).optional(),
  disabledAutoApproveTools: z.array(z.string()).optional(),
  shouldConfig: z.boolean().optional(),
  sortOrder: z.number().optional(),
  isActive: z.boolean(),
  installSource: McpServerInstallSourceSchema.optional(),
  isTrusted: z.boolean().optional(),
  trustedAt: z.number().optional(),
  installedAt: z.number().optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});
export type McpServer = z.infer<typeof McpServerSchema>;

// ============================================================================
// Mobile Projection
// ============================================================================

/**
 * Streamable HTTP rows visible to mobile.
 *
 * The service retains every desktop field while normalizing the fields the
 * mobile UI/runtime consumes directly. Unsupported transports never enter this
 * projection.
 */
export const StreamableHttpMcpServerSchema = McpServerSchema.extend({
  baseUrl: z.string(),
  createdAt: z.iso.datetime(),
  description: z.string(),
  disabledAutoApproveTools: z.array(z.string()),
  disabledTools: z.array(z.string()),
  headers: z.record(z.string(), z.string()),
  type: z.literal('streamableHttp'),
  updatedAt: z.iso.datetime(),
});
export type StreamableHttpMcpServer = z.infer<typeof StreamableHttpMcpServerSchema>;

/**
 * What it takes to write an auto-approve rule for one tool: the server row to
 * update, and the server's own name for the tool — the only form the rule
 * lists can be matched against, since the minted wire id is camelCased and
 * can't be reversed. Display names are not carried; the parts that render one
 * read `serverName` off the part's own metadata.
 */
export type McpToolSource = {
  rawName: string;
  serverId: string;
};

export const DEFAULT_MCP_TIMEOUT_SECONDS = 60;
