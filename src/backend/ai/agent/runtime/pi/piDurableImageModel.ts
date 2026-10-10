import type { Api, Model, TranscriptContext } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { emptyAssistantMessage } from './piStreamEvents';

export const PI_IMAGE_TOOL_NAME = 'cherry_generate_image';

/** Native tool scheduling protects image side effects; this adapter never calls a language API. */
export function imageModelStream(model: Model<Api>, context: TranscriptContext) {
  const stream = new AssistantMessageEventStream();
  const lastUser = context.messages.findLastIndex((message) => message.role === 'user');
  const result = context.messages
    .slice(lastUser + 1)
    .find((message) => message.role === 'toolResult' && message.toolName === PI_IMAGE_TOOL_NAME);
  const failed = result?.role === 'toolResult' && result.isError;
  const hasResult = Boolean(result);
  const message = {
    ...emptyAssistantMessage(model),
    stopReason: failed ? ('error' as const) : hasResult ? ('stop' as const) : ('toolUse' as const),
    ...(failed ? { errorMessage: 'The image request ended without a successful result.' } : {}),
    content: hasResult
      ? []
      : [
          {
            type: 'toolCall' as const,
            id: globalThis.crypto.randomUUID(),
            name: PI_IMAGE_TOOL_NAME,
            arguments: {},
          },
        ],
  };
  if (message.stopReason === 'error')
    stream.push({ type: 'error', reason: 'error', error: message });
  else stream.push({ type: 'done', reason: message.stopReason, message });
  stream.end(message);
  return stream;
}
