import type { StreamChunkPayload } from '@cherrystudio/universal/ai/transport';
import type { UIMessageChunk } from 'ai';

type PendingDelta = StreamChunkPayload & {
  chunk:
    | Extract<UIMessageChunk, { type: 'reasoning-delta' }>
    | Extract<UIMessageChunk, { type: 'text-delta' }>
    | Extract<UIMessageChunk, { type: 'tool-input-delta' }>;
};

export function buildCompactReplay(buffer: readonly StreamChunkPayload[]): StreamChunkPayload[] {
  const compact: StreamChunkPayload[] = [];
  let pending: PendingDelta | undefined;
  const flushPending = () => {
    if (!pending) return;
    compact.push(pending);
    pending = undefined;
  };

  for (const chunk of buffer) {
    switch (chunk.chunk.type) {
      case 'text-delta':
        if (
          pending?.chunk.type === 'text-delta' &&
          pending.chunk.id === chunk.chunk.id &&
          pending.executionId === chunk.executionId &&
          pending.anchorMessageId === chunk.anchorMessageId
        ) {
          pending = {
            ...pending,
            chunk: {
              ...pending.chunk,
              delta: pending.chunk.delta + chunk.chunk.delta,
              providerMetadata: chunk.chunk.providerMetadata ?? pending.chunk.providerMetadata,
            },
          };
        } else {
          flushPending();
          pending = chunk as PendingDelta;
        }
        break;
      case 'reasoning-delta':
        if (
          pending?.chunk.type === 'reasoning-delta' &&
          pending.chunk.id === chunk.chunk.id &&
          pending.executionId === chunk.executionId &&
          pending.anchorMessageId === chunk.anchorMessageId
        ) {
          pending = {
            ...pending,
            chunk: {
              ...pending.chunk,
              delta: pending.chunk.delta + chunk.chunk.delta,
              providerMetadata: chunk.chunk.providerMetadata ?? pending.chunk.providerMetadata,
            },
          };
        } else {
          flushPending();
          pending = chunk as PendingDelta;
        }
        break;
      case 'tool-input-start':
        flushPending();
        compact.push(chunk);
        break;
      case 'tool-input-delta':
        if (
          pending?.chunk.type === 'tool-input-delta' &&
          pending.chunk.toolCallId === chunk.chunk.toolCallId &&
          pending.executionId === chunk.executionId &&
          pending.anchorMessageId === chunk.anchorMessageId
        ) {
          pending = {
            ...pending,
            chunk: {
              ...pending.chunk,
              inputTextDelta: pending.chunk.inputTextDelta + chunk.chunk.inputTextDelta,
            },
          };
        } else {
          flushPending();
          pending = chunk as PendingDelta;
        }
        break;
      default:
        flushPending();
        compact.push(chunk);
        break;
    }
  }

  flushPending();
  return compact;
}
