import type { StreamChunkPayload } from '@cherrystudio/universal/ai/transport';
import type { UIMessageChunk } from 'ai';

import { buildCompactReplay } from '../buildCompactReplay';

describe('buildCompactReplay', () => {
  test('merges adjacent text and tool-input deltas', () => {
    expect(
      buildCompactReplay([
        payload({ id: 'text-1', type: 'text-start' }),
        payload({ delta: 'hel', id: 'text-1', type: 'text-delta' }),
        payload({ delta: 'lo', id: 'text-1', type: 'text-delta' }),
        payload({ toolCallId: 'call-1', toolName: 'search', type: 'tool-input-start' }),
        payload({ inputTextDelta: '{"q":', toolCallId: 'call-1', type: 'tool-input-delta' }),
        payload({ inputTextDelta: '"x"}', toolCallId: 'call-1', type: 'tool-input-delta' }),
      ]),
    ).toEqual([
      payload({ id: 'text-1', type: 'text-start' }),
      payload({ delta: 'hello', id: 'text-1', type: 'text-delta' }),
      payload({ toolCallId: 'call-1', toolName: 'search', type: 'tool-input-start' }),
      payload({ inputTextDelta: '{"q":"x"}', toolCallId: 'call-1', type: 'tool-input-delta' }),
    ]);
  });

  test('never merges deltas across executions or assistant anchors', () => {
    const first = payload(
      { delta: 'a', id: 'text-1', type: 'text-delta' },
      'provider-a::model-a',
      'assistant-a',
    );
    const second = payload(
      { delta: 'b', id: 'text-1', type: 'text-delta' },
      'provider-b::model-b',
      'assistant-b',
    );

    expect(buildCompactReplay([first, second])).toEqual([first, second]);
  });
});

function payload(
  chunk: UIMessageChunk,
  executionId = 'provider::model',
  anchorMessageId = 'assistant-1',
): StreamChunkPayload {
  return {
    anchorMessageId,
    chunk,
    executionId: executionId as StreamChunkPayload['executionId'],
    topicId: 'topic-1',
  };
}
