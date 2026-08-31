/**
 * MCP Server entity types.
 *
 * MOBILE SYNC DIVERGENCE: desktop's `McpServer` describes a launcher for four
 * transports plus a registry install lifecycle. Mobile is a client for one
 * transport (Streamable HTTP) and installs nothing, so this entity is
 * deliberately not desktop's — it is the stored connection, and nothing else.
 */

import * as z from 'zod';

/**
 * A remote MCP endpoint as stored on device.
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
export const McpServerSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string().min(1),
  endpointUrl: z.url(),
  headers: z.record(z.string(), z.string()).optional(),
  isEnabled: z.boolean(),
  disabledTools: z.array(z.string()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type McpServer = z.infer<typeof McpServerSchema>;
