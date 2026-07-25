/**
 * MCP per-tool source policy, ported from desktop
 * `src/shared/ai/tools/mcpSourcePolicy.ts` (disabled-tools subset).
 *
 * An entry may be a raw tool name, a minted tool id, a wire id, or a
 * server-wide wildcard. Only raw names are written today — on either end — so
 * the wider matching is forward compatibility with desktop's shared policy,
 * kept identical here so the two can't drift apart once rows do sync.
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

/**
 * `disabledTools` after switching one tool back on.
 *
 * Dropping every rule that matches the tool is not enough, because a rule can
 * be wider than the tool it was matched by: a server wildcard covers all of
 * them. Such a rule is re-expanded into explicit entries for the tools it still
 * has to cover, so enabling one tool under a wildcard doesn't enable the lot.
 */
export function withMcpToolEnabled(
  server: McpServer,
  toolName: string,
  knownToolNames: string[],
): string[] {
  const next = new Set<string>();
  for (const value of server.disabledTools) {
    if (!matchesMcpSourceToolRule(value, server, { name: toolName })) {
      next.add(value);
      continue;
    }
    for (const other of knownToolNames) {
      if (other !== toolName && matchesMcpSourceToolRule(value, server, { name: other })) {
        next.add(other);
      }
    }
  }
  return [...next];
}

/** `disabledTools` after switching one tool off. */
export function withMcpToolDisabled(server: McpServer, toolName: string): string[] {
  return [...new Set([...server.disabledTools, toolName])];
}
