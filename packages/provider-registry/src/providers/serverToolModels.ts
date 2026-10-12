/**
 * Reviewed model IDs for provider-native web tools, shared by a vendor and the hosts that proxy it.
 * Support is never inferred from a family prefix: batch, Live, image, Codex and search-only
 * variants stay on the external services until they are reviewed and listed here.
 */
export const OPENAI_WEB_SEARCH_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-1',
  'gpt-4-1-mini',
  'gpt-5',
  'gpt-5-mini',
  'gpt-5-1',
  'gpt-5-2',
  'gpt-5-2-pro',
  'gpt-5-4',
  'gpt-5-4-mini',
  'gpt-5-4-pro',
  'gpt-5-5',
  'gpt-5-5-pro',
  'gpt-6-astra',
  'o3',
  'o3-pro',
  'o4-mini',
];

const GEMINI_WEB_TOOL_MODELS = [
  'gemini-2-5-pro',
  'gemini-2-5-flash',
  'gemini-2-5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3-1-pro-preview',
  'gemini-3-5-flash',
  'gemini-3-5-flash-lite',
  'gemini-3-6-flash',
  'gemini-3-7-flash',
  'gemini-3-8-flash',
];
export const GEMINI_WEB_SEARCH_MODELS = [...GEMINI_WEB_TOOL_MODELS, 'gemini-2-0-flash'];
export const GEMINI_URL_CONTEXT_MODELS = [...GEMINI_WEB_TOOL_MODELS, 'gemini-3-1-flash-lite'];

export const CLAUDE_WEB_TOOL_MODELS = [
  'claude-haiku-4-5',
  'claude-haiku-5-5',
  'claude-opus-4',
  'claude-opus-4-1',
  'claude-opus-4-5',
  'claude-opus-4-6',
  'claude-opus-4-6-v1',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-opus-4-8-fast',
  'claude-opus-5-5',
  'claude-sonnet-4',
  'claude-sonnet-4-5',
  'claude-sonnet-4-6',
  'claude-sonnet-5-5',
];
