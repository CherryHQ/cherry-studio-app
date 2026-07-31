/**
 * MCP tool-result normalization, ported from desktop
 * `src/main/ai/tools/adapters/aiSdk/mcp/utils.ts` and kept tolerant of protocol
 * additions that the installed SDK may not know yet.
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
  uri?: string;
};

export type McpCallToolResult = {
  content?: McpResultContentItem[];
  isError?: boolean;
  structuredContent?: unknown;
  toolResult?: unknown;
};

export type NormalizedMcpContent =
  | { kind: 'audio'; mimeType: string }
  | { data: string; kind: 'image'; mimeType: string }
  | { kind: 'resource'; mimeType: string; uri: string }
  | { kind: 'resource-link'; mimeType: string; uri: string }
  | { kind: 'text'; text: string };

export type NormalizedMcpResult = {
  content: NormalizedMcpContent[];
  isMissing: boolean;
};

const MISSING_RESULT_SUMMARY = '[MCP tool returned no result]';

export function normalizeMcpResult(result: unknown): NormalizedMcpResult {
  if (result === undefined || result === null) {
    return { content: [], isMissing: true };
  }

  if (typeof result === 'string') {
    return { content: [{ kind: 'text', text: result }], isMissing: false };
  }

  if (!isRecord(result)) {
    return { content: [{ kind: 'text', text: stringify(result) }], isMissing: false };
  }

  if (typeof result.content === 'string') {
    return { content: [{ kind: 'text', text: result.content }], isMissing: false };
  }

  if (!Array.isArray(result.content)) {
    return { content: [{ kind: 'text', text: stringify(result) }], isMissing: false };
  }

  const content = result.content.map(normalizeContentItem);
  if (content.length === 0 && result.structuredContent !== undefined) {
    content.push({ kind: 'text', text: stringify(result.structuredContent) });
  }

  return { content, isMissing: false };
}

export function mcpResultToTextSummary(result: McpCallToolResult | undefined): string {
  const normalized = normalizeMcpResult(result);
  if (normalized.isMissing) {
    return MISSING_RESULT_SUMMARY;
  }

  return normalized.content.map(contentToModelText).join('\n');
}

function normalizeContentItem(value: unknown): NormalizedMcpContent {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return { kind: 'text', text: stringify(value) };
  }

  if (value.type === 'text' && typeof value.text === 'string') {
    return { kind: 'text', text: value.text };
  }

  if (value.type === 'image' && typeof value.data === 'string') {
    return {
      data: value.data,
      kind: 'image',
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'image/png',
    };
  }

  if (value.type === 'audio') {
    return {
      kind: 'audio',
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'audio/mpeg',
    };
  }

  if (value.type === 'resource' && isRecord(value.resource)) {
    if (typeof value.resource.text === 'string') {
      return { kind: 'text', text: value.resource.text };
    }
    if (typeof value.resource.blob === 'string') {
      return {
        kind: 'resource',
        mimeType:
          typeof value.resource.mimeType === 'string'
            ? value.resource.mimeType
            : 'application/octet-stream',
        uri: typeof value.resource.uri === 'string' ? value.resource.uri : 'unknown',
      };
    }
  }

  if (value.type === 'resource_link' && typeof value.uri === 'string') {
    return {
      kind: 'resource-link',
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'unknown',
      uri: value.uri,
    };
  }

  return { kind: 'text', text: stringify(value) };
}

function contentToModelText(content: NormalizedMcpContent): string {
  switch (content.kind) {
    case 'text':
      return content.text;
    case 'image':
      return `[Image: ${content.mimeType}, delivered to user]`;
    case 'audio':
      return `[Audio: ${content.mimeType}, preview unavailable in app]`;
    case 'resource':
      return `[Resource: ${content.mimeType}, uri=${content.uri}, preview unavailable in app]`;
    case 'resource-link':
      return `[Resource link: ${content.mimeType}, uri=${content.uri}]`;
  }
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
