import type { ProviderHeaders } from '@earendil-works/pi-ai';

const BINDING_BETA = 'thinking-binding-controls-2026-08-01';

/** Only models documented to accept binding controls; do not send beta fields to older models. */
export function supportsThinkingBinding(modelId: string): boolean {
  return /(?:^|\/)claude-(?:fable-5[.-]1|(?:opus|sonnet|haiku)-5[.-]5)(?:$|[-:])/u.test(modelId);
}

export function addThinkingBindingHeader(headers: ProviderHeaders): void {
  const names = Object.keys(headers).filter((key) => key.toLowerCase() === 'anthropic-beta');
  const values = names.flatMap(
    (key) => headers[key]?.split(',').map((value) => value.trim()) ?? [],
  );
  for (const key of names) delete headers[key];
  headers['anthropic-beta'] = [...new Set([...values.filter(Boolean), BINDING_BETA])].join(',');
}

/**
 * Deferred discovery and instruction sections can change the prefix. Let Anthropic drop only
 * invalidated thinking while preserving tool calls/results. Never edit signed thinking text.
 * https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting
 */
export function applyThinkingBinding(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const thinking = 'thinking' in payload ? payload.thinking : undefined;
  // Other thinking modes cannot use binding controls. Preserve the text/tool round trip,
  // but omit all historical thinking as documented for a changed conversation prefix.
  if (
    !thinking ||
    typeof thinking !== 'object' ||
    !('type' in thinking) ||
    thinking.type !== 'adaptive'
  ) {
    if (!('messages' in payload) || !Array.isArray(payload.messages)) return payload;
    return {
      ...payload,
      messages: payload.messages.flatMap((message: unknown) => {
        if (
          !message ||
          typeof message !== 'object' ||
          !('content' in message) ||
          !Array.isArray(message.content)
        )
          return [message];
        const content = message.content.filter(
          (block: { type?: string }) =>
            block.type !== 'thinking' && block.type !== 'redacted_thinking',
        );
        return content.length ? [{ ...message, content }] : [];
      }),
    };
  }
  return {
    ...payload,
    thinking: { ...thinking, block_binding: { prefix_mismatch_behavior: 'drop_block' } },
  };
}
