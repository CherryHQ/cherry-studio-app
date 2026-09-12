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
  | { data?: string; kind: 'audio'; mimeType: string }
  | { data: string; kind: 'image'; mimeType: string }
  | { kind: 'json'; value: unknown }
  | { data?: string; kind: 'resource'; mimeType: string; text?: string; uri: string }
  | { kind: 'resource-link'; mimeType: string; uri: string }
  | { kind: 'text'; text: string };

export type NormalizedMcpResult = {
  content: NormalizedMcpContent[];
  isError: boolean;
  isMissing: boolean;
};

const MISSING_RESULT_SUMMARY = '[MCP tool returned no result]';

export function normalizeMcpResult(result: unknown): NormalizedMcpResult {
  if (result === undefined || result === null) {
    return { content: [], isError: false, isMissing: true };
  }

  if (typeof result === 'string') {
    return { content: [{ kind: 'text', text: result }], isError: false, isMissing: false };
  }

  if (!isRecord(result)) {
    return { content: [{ kind: 'json', value: result }], isError: false, isMissing: false };
  }

  const isError = result.isError === true;

  if (typeof result.content === 'string') {
    return { content: [{ kind: 'text', text: result.content }], isError, isMissing: false };
  }

  if (result.content === undefined && result.structuredContent !== undefined) {
    return {
      content: [{ kind: 'json', value: result.structuredContent }],
      isError,
      isMissing: false,
    };
  }

  if (!Array.isArray(result.content)) {
    return { content: [{ kind: 'json', value: result }], isError, isMissing: false };
  }

  const content = result.content.map(normalizeContentItem);
  // MCP servers commonly mirror structured content into a text block for compatibility.
  // Prefer the ordered content blocks and use structured content only as an empty-result fallback.
  if (content.length === 0 && result.structuredContent !== undefined) {
    content.push({ kind: 'json', value: result.structuredContent });
  }

  return { content, isError, isMissing: false };
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
    return { kind: 'json', value };
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
      ...(typeof value.data === 'string' ? { data: value.data } : {}),
      kind: 'audio',
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'audio/mpeg',
    };
  }

  if (value.type === 'resource' && isRecord(value.resource)) {
    const mimeType =
      typeof value.resource.mimeType === 'string'
        ? value.resource.mimeType
        : 'application/octet-stream';
    const uri = typeof value.resource.uri === 'string' ? value.resource.uri : 'unknown';
    if (typeof value.resource.text === 'string') {
      return { kind: 'resource', mimeType, text: value.resource.text, uri };
    }
    if (typeof value.resource.blob === 'string') {
      return {
        data: value.resource.blob,
        kind: 'resource',
        mimeType,
        uri,
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

  return { kind: 'json', value };
}

function contentToModelText(content: NormalizedMcpContent): string {
  switch (content.kind) {
    case 'text':
      return content.text;
    case 'json':
      return stringify(content.value);
    case 'image':
      return `[Image: ${content.mimeType}, delivered to user]`;
    case 'audio':
      return `[Audio: ${content.mimeType}, preview unavailable in app]`;
    case 'resource':
      return (
        content.text ??
        `[Resource: ${content.mimeType}, uri=${content.uri}, preview unavailable in app]`
      );
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
