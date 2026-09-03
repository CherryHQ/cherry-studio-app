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
