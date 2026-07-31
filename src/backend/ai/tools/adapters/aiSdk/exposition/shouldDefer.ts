import type { ToolEntry } from '../types';

const DEFER_THRESHOLD_PCT = 10;
const FALLBACK_CONTEXT_WINDOW = 32_000;
const CHARS_PER_TOKEN = 4;
const META_TOOLS_OVERHEAD_TOKENS = 500;
const MIN_AUTO_DEFER_COUNT = 5;

export function shouldDefer(entries: readonly ToolEntry[], contextWindow?: number) {
  const contextSize = contextWindow && contextWindow > 0 ? contextWindow : FALLBACK_CONTEXT_WINDOW;
  const threshold = Math.floor(contextSize * (DEFER_THRESHOLD_PCT / 100));
  const always = entries.filter((entry) => entry.defer === 'always');
  const automatic = entries.filter((entry) => entry.defer === 'auto');
  const automaticCost = estimateTokens(automatic);
  const shouldDeferAutomatic =
    automatic.length >= MIN_AUTO_DEFER_COUNT &&
    automaticCost > threshold &&
    automaticCost > META_TOOLS_OVERHEAD_TOKENS;
  return {
    deferredNames: new Set(
      [...always, ...(shouldDeferAutomatic ? automatic : [])].map((entry) => entry.name),
    ),
    threshold,
  };
}

function estimateTokens(entries: readonly ToolEntry[]): number {
  let characters = 0;
  for (const entry of entries) {
    characters += entry.name.length;
    if (typeof entry.tool.description === 'string') {
      characters += entry.tool.description.length;
    }
    if (entry.tool.inputSchema) {
      characters += JSON.stringify(entry.tool.inputSchema).length;
    }
  }
  return Math.ceil(characters / CHARS_PER_TOKEN);
}
