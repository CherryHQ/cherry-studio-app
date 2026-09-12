/** Presentation kinds selected by trusted app adapters; arbitrary tool strings stay `text`. */
export type ToolResultContent =
  | { fallbackText: string; kind: 'audio' }
  | { content: string; kind: 'code'; language?: string }
  | { data: string; kind: 'image'; mimeType: string }
  | { kind: 'json'; value: unknown }
  | { content: string; kind: 'markdown' }
  | { fallbackText: string; kind: 'resource' }
  | { kind: 'resource-link'; label: string; uri: string }
  | { content: string; kind: 'text' };

export const TOOL_RESULT_PREVIEW_LIMIT = 4_000;

/** One text budget for the entire output, including multi-block MCP results. */
export function createToolResultPreview(contents: readonly ToolResultContent[]) {
  const preview: ToolResultContent[] = [];
  let remaining = TOOL_RESULT_PREVIEW_LIMIT;
  let isTruncated = false;

  for (const content of contents) {
    if (content.kind === 'image') {
      preview.push(content);
      continue;
    }
    if (remaining === 0 && content.kind === 'json') {
      isTruncated = true;
      continue;
    }

    // Format JSON once, before clipping and before the Markdown renderer sees it.
    const normalized: Exclude<ToolResultContent, { kind: 'json' }> =
      content.kind === 'json'
        ? { content: formatToolResultJson(content.value), kind: 'code', language: 'json' }
        : content;
    const text = toolResultText(normalized);
    if (text.length <= remaining) {
      preview.push(normalized);
      remaining -= text.length;
      continue;
    }

    isTruncated = true;
    if (remaining === 0) continue;
    const clipped = text.slice(0, remaining).replace(/[\uD800-\uDBFF]$/, '');
    remaining = 0;
    if ('content' in normalized) {
      preview.push({ ...normalized, content: clipped });
    } else if ('fallbackText' in normalized) {
      preview.push({ ...normalized, fallbackText: clipped });
    } else if (normalized.kind === 'resource-link') {
      preview.push({ ...normalized, label: clipped });
    }
  }

  return { contents: preview, isTruncated };
}

/** Called only on copy; the complete text never enters the preview render tree. */
export function getToolResultCopyText(contents: readonly ToolResultContent[]): string {
  return contents
    .map((content) => (content.kind === 'resource-link' ? content.uri : toolResultText(content)))
    .filter(Boolean)
    .join('\n\n');
}

function toolResultText(content: ToolResultContent): string {
  switch (content.kind) {
    case 'audio':
    case 'resource':
      return content.fallbackText;
    case 'code':
    case 'markdown':
    case 'text':
      return content.content;
    case 'json':
      return formatToolResultJson(content.value);
    case 'resource-link':
      return content.label;
    case 'image':
      return '';
  }
}

export function parseJsonToolResultText(text: string): { value: unknown } | null {
  if (!text.trim()) return null;

  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
}

export function textToolResultContent(text: string, language?: string): ToolResultContent {
  const parsedJson = parseJsonToolResultText(text);
  if (parsedJson) return { kind: 'json', value: parsedJson.value };
  return language ? { content: text, kind: 'code', language } : { content: text, kind: 'text' };
}

export function formatToolResultJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
