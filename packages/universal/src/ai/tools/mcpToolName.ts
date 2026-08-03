/**
 * MCP function-call tool naming, ported from desktop
 * `src/shared/ai/tools/mcpToolName.ts` (subset used by mobile).
 */

import { fnv1a32 } from '@shared/utils/fnv1a';

/**
 * Convert a string to camelCase, ensuring it's a valid JavaScript identifier.
 *
 * - Normalizes to lowercase first, then capitalizes word boundaries
 * - Non-alphanumeric characters are treated as word separators
 * - Non-ASCII characters are dropped (ASCII-only output)
 * - If result starts with a digit, prefixes with underscore
 */
export function toCamelCase(str: string): string {
  let result = str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, char: string) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');

  if (result && !/^[a-zA-Z_]/.test(result)) {
    result = `_${result}`;
  }

  return result;
}

export type McpToolNameOptions = {
  /** Prefix added before the name (e.g. `mcp__`). Must be identifier-safe. */
  prefix?: string;
  /** Delimiter between server and tool parts. Must be identifier-safe. */
  delimiter?: string;
  /** Maximum final name length, including a collision suffix. */
  maxLength?: number;
  /** Mutable set used to allocate a collision-free name. */
  existingNames?: Set<string>;
};

/** Build a JavaScript-safe MCP name with configurable wire formatting. */
export function buildMcpToolName(
  serverName: string | undefined,
  toolName: string,
  options: McpToolNameOptions = {},
): string {
  const { prefix = '', delimiter = '_', maxLength, existingNames } = options;
  const serverPart = serverName ? toCamelCase(serverName) : '';
  const toolPart = toCamelCase(toolName);
  const baseName = serverPart
    ? `${prefix}${serverPart}${delimiter}${toolPart}`
    : `${prefix}${toolPart}`;

  if (!existingNames) {
    return maxLength ? truncateToLength(baseName, maxLength) : baseName;
  }

  let name = maxLength ? truncateToLength(baseName, maxLength) : baseName;
  let counter = 1;
  while (existingNames.has(name)) {
    const suffix = String(counter);
    const truncatedBase = maxLength
      ? truncateToLength(baseName, maxLength - suffix.length)
      : baseName;
    name = `${truncatedBase}${suffix}`;
    counter += 1;
  }

  existingNames.add(name);
  return name;
}

/** Generate the legacy `serverName_toolName` function-call identifier. */
export function generateMcpToolFunctionName(
  serverName: string | undefined,
  toolName: string,
  existingNames?: Set<string>,
): string {
  return buildMcpToolName(serverName, toolName, { existingNames });
}

const FUNCTION_CALL_TOOL_NAME_MAX_LENGTH = 63;
/** `_` + a fixed-width base36 hash of the server name, reserved on truncation. */
const SERVER_DISAMBIGUATOR_LENGTH = 7;

/**
 * Hash of the server name as a fixed-width base36 string. Identifier-safe
 * (`[0-9a-z]`) so it can sit inside a JS-identifier tool name.
 */
function hashServerName(serverName: string): string {
  return fnv1a32(serverName)
    .toString(36)
    .padStart(SERVER_DISAMBIGUATOR_LENGTH, '0')
    .slice(-SERVER_DISAMBIGUATOR_LENGTH);
}

function truncateToLength(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength).replace(/_+$/, '');
}

/**
 * Builds a valid JavaScript function name for MCP tool calls.
 * Format: `mcp__{server}__{tool}` (camelCase), max 63 chars.
 *
 * When the untruncated name exceeds the cap the tail is dropped — and for long
 * server names the `__` delimiter and part of the server segment go with it,
 * which would let two distinct servers/tools mint the same id. In that case a
 * server-derived suffix (`_<hash(serverName)>`) is appended so the id stays
 * unique per server and remains attributable to it from the server name alone.
 */
export function buildFunctionCallToolName(serverName: string, toolName: string): string {
  const serverPart = serverName ? toCamelCase(serverName) : '';
  const toolPart = toCamelCase(toolName);
  const baseName = serverPart ? `mcp__${serverPart}__${toolPart}` : `mcp__${toolPart}`;
  if (baseName.length <= FUNCTION_CALL_TOOL_NAME_MAX_LENGTH) {
    return baseName;
  }
  const suffix = `_${hashServerName(serverName)}`;
  const body = truncateToLength(baseName, FUNCTION_CALL_TOOL_NAME_MAX_LENGTH - suffix.length);
  return `${body}${suffix}`;
}

export type McpFunctionCallToolNameParts = {
  serverPart: string;
  toolPart: string;
};

/** Parse MCP tool-call names in the `mcp__{server}__{tool}` format. */
export function parseFunctionCallToolName(toolName: string): McpFunctionCallToolNameParts | null {
  if (!toolName.startsWith('mcp__')) return null;

  const rest = toolName.slice('mcp__'.length);
  const delimiterIndex = rest.lastIndexOf('__');
  if (delimiterIndex <= 0 || delimiterIndex >= rest.length - 2) return null;

  return {
    serverPart: rest.slice(0, delimiterIndex),
    toolPart: rest.slice(delimiterIndex + 2),
  };
}

/** Test whether a minted function-call id belongs to the named MCP server. */
export function isFunctionCallToolNameForServer(serverName: string, toolId: string): boolean {
  const serverPart = toCamelCase(serverName);
  if (toolId.startsWith(`mcp__${serverPart}__`)) return true;

  const suffix = `_${hashServerName(serverName)}`;
  if (!toolId.endsWith(suffix)) return false;

  const body = toolId.slice(0, toolId.length - suffix.length);
  const serverCore = `mcp__${serverPart}`;
  return serverCore.startsWith(body) || body.startsWith(serverCore);
}
