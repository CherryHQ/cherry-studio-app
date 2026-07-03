import type {
  CherryMessagePart,
  CherryUIMessage,
  CherryUIMessageMetadata,
  Message,
  MessageStats,
} from '@/data/types/message';

/** Token counts come from `metadata`, populated by `Agent.stream`'s
 * per-step usage accumulator via `message-metadata` chunks. */
export function statsFromMetadata(
  metadata: CherryUIMessageMetadata | undefined,
): MessageStats | undefined {
  if (!metadata) return undefined;

  const stats: MessageStats = {};
  if (typeof metadata.totalTokens === 'number') stats.totalTokens = metadata.totalTokens;
  if (typeof metadata.promptTokens === 'number') stats.promptTokens = metadata.promptTokens;
  if (typeof metadata.completionTokens === 'number')
    stats.completionTokens = metadata.completionTokens;
  if (typeof metadata.thoughtsTokens === 'number') stats.thoughtsTokens = metadata.thoughtsTokens;

  return Object.keys(stats).length > 0 ? stats : undefined;
}

export function applyStreamingMessage(baseMessage: Message, uiMessage: CherryUIMessage): Message {
  return {
    ...baseMessage,
    data: {
      ...baseMessage.data,
      parts: uiMessage.parts as CherryMessagePart[],
    },
    status: 'pending',
    updatedAt: new Date().toISOString(),
  };
}

export function mergeMessagesWithOverlay(
  messages: readonly Message[],
  overlayMessage?: Message,
): readonly Message[] {
  if (!overlayMessage) {
    return messages;
  }

  let didReplace = false;
  const nextMessages = messages.map((message) => {
    if (message.id !== overlayMessage.id) {
      return message;
    }

    didReplace = true;
    return overlayMessage;
  });

  return didReplace ? nextMessages : [...nextMessages, overlayMessage];
}
