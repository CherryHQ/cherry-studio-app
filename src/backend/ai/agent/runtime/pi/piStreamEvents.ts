import type { AssistantMessage, AssistantMessageEvent, Model } from '@earendil-works/pi-ai';

export type PiStreamErrorEvent = Extract<AssistantMessageEvent, { type: 'error' }>;

/** The partial result before a source emits anything, matching pi-ai's initial message. */
export function emptyAssistantMessage(model: Model<string>): AssistantMessage {
  return {
    role: 'assistant',
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [],
    stopReason: 'stop',
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

/** Signed or redacted blocks count as content even without visible text. */
export function hasResponseContent(message: AssistantMessage): boolean {
  return message.content.some((block) => {
    if (block.type === 'text') return block.text.length > 0 || !!block.textSignature;
    if (block.type === 'thinking') {
      return block.thinking.length > 0 || !!block.thinkingSignature || !!block.redacted;
    }
    return true;
  });
}

/** Text or thinking lifecycle events that carry no content yet. */
export function isEmptyContentEvent(event: AssistantMessageEvent): boolean {
  switch (event.type) {
    case 'text_start':
    case 'thinking_start':
      return !hasResponseContent(event.partial);
    case 'text_delta':
    case 'thinking_delta':
      return event.delta.length === 0 && !hasResponseContent(event.partial);
    case 'text_end':
    case 'thinking_end':
      return event.content.length === 0 && !hasResponseContent(event.partial);
    default:
      return false;
  }
}

export function errorRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Terminalize a thrown error as a provider failure appended to the partial result. */
export function providerErrorEvent(
  partial: AssistantMessage,
  error: unknown,
  aborted = false,
): PiStreamErrorEvent {
  const message = error instanceof Error ? error.message : String(error);
  const record = errorRecord(error);
  const code = record?.code ?? record?.type;
  const reason = aborted ? 'aborted' : 'error';
  return {
    type: 'error',
    reason,
    error: {
      ...partial,
      stopReason: reason,
      errorMessage: message,
      diagnostics: [
        ...(partial.diagnostics ?? []),
        {
          type: 'provider_response_failure',
          timestamp: Date.now(),
          error: {
            name: error instanceof Error ? error.name : 'Error',
            message,
            ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
          },
          details: {
            status: record?.statusCode ?? record?.status,
            body: record?.error ?? record?.body,
            retryable: record?.retryable,
          },
        },
      ],
    },
  };
}
