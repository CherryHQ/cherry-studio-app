/**
 * MCP tool-result formatters, ported from desktop
 * `src/main/ai/tools/adapters/aiSdk/mcp/utils.ts`.
 *
 * Types are structural (not imported from the MCP SDK) so the formatter stays
 * tolerant of protocol additions.
 */

type McpResultContentItem = {
  data?: string;
  mimeType?: string;
  resource?: {
    blob?: string;
    mimeType?: string;
    text?: string;
    uri?: string;
  };
  text?: string;
  type: string;
};

export type McpCallToolResult = {
  content?: McpResultContentItem[];
  isError?: boolean;
};

/** Stand-in for a call that produced nothing at all, so the model is not told
 * an empty answer succeeded. */
const MISSING_RESULT_SUMMARY = '[MCP tool returned no result]';

/**
 * Flatten for the model's view: text verbatim; image/audio/blob →
 * placeholder; text-backed resource → its `text`; unknown → JSON.
 */
export function mcpResultToTextSummary(result: McpCallToolResult | undefined): string {
  if (result === undefined || result === null) {
    // This goes straight into a model-facing text part, and `JSON.stringify`
    // would hand back `undefined` here. An empty string is worse than useless:
    // the model reads it as a successful empty answer and reports "no results".
    return MISSING_RESULT_SUMMARY;
  }
  if (!result.content || !Array.isArray(result.content)) {
    return JSON.stringify(result);
  }

  const parts: string[] = [];
  for (const item of result.content) {
    switch (item.type) {
      case 'text':
        parts.push(item.text || '');
        break;
      case 'image':
        parts.push(`[Image: ${item.mimeType || 'image/png'}, delivered to user]`);
        break;
      case 'audio':
        parts.push(`[Audio: ${item.mimeType || 'audio/mp3'}, delivered to user]`);
        break;
      case 'resource':
        if (item.resource?.blob) {
          parts.push(
            `[Resource: ${item.resource.mimeType || 'application/octet-stream'}, uri=${
              item.resource.uri || 'unknown'
            }, delivered to user]`,
          );
        } else {
          parts.push(item.resource?.text || JSON.stringify(item));
        }
        break;
      default:
        parts.push(JSON.stringify(item));
        break;
    }
  }

  return parts.join('\n');
}
