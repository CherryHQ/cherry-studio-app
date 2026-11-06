/** Longest Mermaid source the app sends to the page; longer fences remain code blocks. */
export const MERMAID_SOURCE_LIMIT = 32_768;

/** Largest SVG the page returns. Larger results count as a failed render. */
export const MERMAID_SVG_LIMIT = 1_048_576;

/** One render request, injected by the app as `window.cherryMermaid.render(request)`. */
export type MermaidPageRequest = { id: number; source: string; dark: boolean };

/** Messages the page posts to the app. */
export type MermaidPageMessage =
  | { type: 'ready' }
  | { type: 'rendered'; id: number; svg: string; width: number; height: number }
  | { type: 'failed'; id: number };

/** Validates one page message. JSON escaping can double the SVG's length on the wire. */
export function parseMermaidPageMessage(data: string): MermaidPageMessage | undefined {
  if (data.length > MERMAID_SVG_LIMIT * 2 + 1024) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const message = value as Record<string, unknown>;
  if (message.type === 'ready') return { type: 'ready' };
  const { id } = message;
  if (typeof id !== 'number' || !Number.isSafeInteger(id)) return undefined;
  if (message.type === 'failed') return { type: 'failed', id };
  const { svg, width, height } = message;
  if (
    message.type !== 'rendered' ||
    typeof svg !== 'string' ||
    svg.length > MERMAID_SVG_LIMIT ||
    !isDimension(width) ||
    !isDimension(height)
  ) {
    return undefined;
  }
  return { type: 'rendered', id, svg, width, height };
}

function isDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
