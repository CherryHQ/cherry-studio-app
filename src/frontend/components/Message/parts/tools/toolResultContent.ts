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

/** The section action copies every text block, including blocks below the visible viewport. */
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
