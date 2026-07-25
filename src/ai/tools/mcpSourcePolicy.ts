/**
 * MCP per-tool source policy, ported from desktop
 * `src/shared/ai/tools/mcpSourcePolicy.ts` (disabled-tools subset).
 *
 * `disabledTools` rows sync across desktop and mobile, so the matching rules
 * must stay identical: an entry may be a raw tool name, a wire id, or a
 * server-wide wildcard. Matching on the raw name alone would silently let a
 * wildcard-disabled tool through on mobile.
 */

import type { McpServer } from '@/data/types/mcpServer';
import { buildFunctionCallToolName, toCamelCase } from './mcpToolName';

export type McpPolicyTool = {
  /** The minted `mcp__server__tool` id, when the caller already has one. */
  id?: string;
  name: string;
};

export function buildMcpWireToolId(serverName: string, toolName: string): string {
  return buildFunctionCallToolName(serverName, toolName);
}

export function buildMcpWireWildcard(serverName: string): string {
  return `mcp__${toCamelCase(serverName)}__*`;
}

/** True when a `disabledTools`/`disabledAutoApproveTools` entry targets `tool`. */
export function matchesMcpSourceToolRule(
  value: string,
  server: McpServer,
  tool: McpPolicyTool,
): boolean {
  return (
    value === tool.name ||
    value === tool.id ||
    value === buildMcpWireToolId(server.name, tool.name) ||
    value === buildMcpWireWildcard(server.name)
  );
}

export function isMcpToolDisabledBySource(server: McpServer, tool: McpPolicyTool): boolean {
  return server.disabledTools.some((value) => matchesMcpSourceToolRule(value, server, tool));
}
