import type { Api as PiApi } from '@earendil-works/pi-ai';

/** Pi's simple stream options omit toolChoice on some APIs; enforce it on the final payload. */
export function disablePiToolCalls(payload: unknown, api: PiApi): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Pi produced an invalid provider request.');
  }
  switch (api) {
    case 'anthropic-messages':
      return { ...payload, tool_choice: { type: 'none' } };
    case 'openai-completions':
    case 'openai-responses':
      return { ...payload, tool_choice: 'none' };
    case 'google-generative-ai': {
      const { config } = payload as { config?: Record<string, unknown> };
      return {
        ...payload,
        config: { ...config, toolConfig: { functionCallingConfig: { mode: 'NONE' } } },
      };
    }
    default:
      throw new Error(`Pi cannot disable tool calls for API: ${api}`);
  }
}
