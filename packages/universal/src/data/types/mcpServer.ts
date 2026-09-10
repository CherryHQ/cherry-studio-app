/**
 * MCP Server entity types.
 *
 * MOBILE SYNC DIVERGENCE: desktop's `McpServer` describes a launcher for four
 * transports plus a registry install lifecycle. Mobile connects to remote
 * Streamable HTTP endpoints or bundled in-process plugins and installs no code.
 * Plugin credentials belong to a separate device-local authorization store.
 */

import * as z from 'zod';

/**
 * Shared server identity and tool availability as stored on device.
 *
 * `endpointUrl` is the complete MCP endpoint (e.g. `https://example.com/mcp`).
 * `headers` carries user-configured HTTP authentication and routing metadata.
 * Protocol version, server info and the tool list are connection results, not
 * configuration, and so are absent here by design.
 *
 * `disabledTools` holds raw tool names exactly as the server reports them.
 * Desktop's rule vocabulary also admits minted ids and server wildcards, but
 * neither end has ever written one, and mobile's row cannot sync to desktop's
 * anyway, so a name is the whole rule here.
 */
const McpServerBaseSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string().min(1),
  isEnabled: z.boolean(),
  disabledTools: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const RemoteMcpServerSchema = McpServerBaseSchema.extend({
  origin: z.literal('remote').optional(),
  endpointUrl: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const BuiltInMcpServerSchema = McpServerBaseSchema.extend({
  origin: z.literal('builtin'),
  builtinId: z.enum(['github', 'amap']),
  authorizationId: z.uuidv4(),
  endpointUrl: z.null(),
  headers: z.never().optional(),
});

export const McpServerSchema = z.union([RemoteMcpServerSchema, BuiltInMcpServerSchema]);
export type McpServer = z.infer<typeof McpServerSchema>;

export type RemoteMcpServer = z.infer<typeof RemoteMcpServerSchema>;
