/**
 * MCP per-tool source policy. The read side (`matches…`, `isMcpTool…`) is
 * ported from desktop `src/shared/ai/tools/mcpSourcePolicy.ts`; the write side
 * (`with…`) has no desktop counterpart — desktop mutates its rule lists inline
 * at each call site — so it is ours, written to keep the same rule vocabulary.
 *
 * An entry may be a raw tool name, a minted tool id, a wire id, or a
 * server-wide wildcard. Only raw names are written today — on either end — so
 * the wider matching is forward compatibility with desktop's shared policy,
 * kept identical here so the two can't drift apart once rows do sync.
 */

import type { McpServer } from '@/data/types/mcpServer';
import { buildFunctionCallToolName, toCamelCase } from './mcpToolName';

type McpPolicyTool = {
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

/**
 * True when a rule list holds this server's wildcard — the one entry that
 * covers tools it does not name, and so the one whose removal has to be
 * re-expanded against a complete tool list.
 */
export function hasMcpServerWildcardRule(rules: readonly string[], server: McpServer): boolean {
  return rules.includes(buildMcpWireWildcard(server.name));
}

export function isMcpToolDisabledBySource(server: McpServer, tool: McpPolicyTool): boolean {
  return (server.disabledTools ?? []).some((value) =>
    matchesMcpSourceToolRule(value, server, tool),
  );
}

/**
 * True when the tool must ask the user before running (desktop
 * `isMcpToolForcePromptBySource`). An empty list means every tool is
 * auto-approved — approval is opt-in per tool.
 */
export function isMcpToolForcePromptBySource(server: McpServer, tool: McpPolicyTool): boolean {
  return (server.disabledAutoApproveTools ?? []).some((value) =>
    matchesMcpSourceToolRule(value, server, tool),
  );
}

/**
 * A rule list (`disabledTools` or `disabledAutoApproveTools`) after clearing
 * one tool from it.
 *
 * Dropping every rule that matches the tool is not enough, because a rule can
 * be wider than the tool it was matched by: a server wildcard covers all of
 * them. Such a rule is re-expanded into explicit entries for the tools it still
 * has to cover, so clearing one tool under a wildcard doesn't clear the lot.
 */
export function withMcpToolRuleCleared(
  rules: readonly string[],
  server: McpServer,
  toolName: string,
  knownToolNames: string[],
): string[] {
  const next = new Set<string>();
  for (const value of rules) {
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

/** A rule list after adding one tool to it. */
export function withMcpToolRuleAdded(rules: readonly string[], toolName: string): string[] {
  return [...new Set([...rules, toolName])];
}
