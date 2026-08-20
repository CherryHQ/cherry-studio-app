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
 * Protocol version, server info and the tool list are connection results, not
 * configuration, and so are absent here by design.
 */
export const McpServerSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string().min(1),
  endpointUrl: z.url(),
  isEnabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type McpServer = z.infer<typeof McpServerSchema>;
