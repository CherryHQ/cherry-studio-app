import type { RemoteMessageView } from '@/shared/contracts/remoteAgent';

import type { MessageRef, ResourceRef } from '../../contracts';
import { remoteMessage } from '../remoteConversationViews';

it('keeps tools in process order without putting deferred input/output values into the shared renderer', () => {
  const message: RemoteMessageView = {
    id: 'reply',
    version: '1',
    role: 'assistant',
    state: 'success',
    parts: [
      { id: 'r', kind: 'reasoning', text: 'Plan', complete: true },
      {
        id: 'call1',
        kind: 'tool',
        callId: 'call1',
        name: 'read_file',
        state: 'completed',
        input: 'input-ref',
        output: 'output-ref',
      },
      { id: 't', kind: 'text', text: 'Found the file', complete: true },
      {
        id: 'call2',
        kind: 'tool',
        callId: 'call2',
        name: 'edit_file',
        state: 'failed',
        output: 'error-ref',
      },
      { id: 'last', kind: 'text', text: 'Final answer', complete: true },
    ],
  };
  const projected = remoteMessage(message, 'message' as MessageRef, (id) => id as ResourceRef);
  expect(projected.display.data.partKeys).toEqual(['r', 'call1', 't', 'call2', 'last']);
  expect(projected.display.data.parts?.map((part) => part.type)).toEqual([
    'reasoning',
    'dynamic-tool',
    'text',
    'dynamic-tool',
    'text',
  ]);
  expect(projected.display.data.parts?.[1]).toMatchObject({
    state: 'output-available',
    input: undefined,
    output: undefined,
  });
  expect(projected.display.data.parts?.[3]).toMatchObject({ state: 'output-error' });
  expect(JSON.stringify(projected.display)).not.toMatch(/input-ref|output-ref|error-ref/);
  expect(projected.tools?.[0].output).toBe('output-ref');
});

it('preserves trailing live prose and keeps metadata-only files out of local file identifiers', () => {
  const projected = remoteMessage(
    {
      id: 'reply',
      version: '2',
      role: 'assistant',
      state: 'streaming',
      parts: [
        { id: 'call', kind: 'tool', callId: 'call', name: 'read_file', state: 'streaming' },
        { id: 'text', kind: 'text', text: 'Still working', complete: true },
        {
          id: 'file',
          kind: 'file',
          name: 'result.png',
          mediaType: 'image/png',
          resource: 'pc-file',
        },
      ],
    },
    'message' as MessageRef,
    (id) => id as ResourceRef,
  );
  expect(projected.display.data.partKeys).toEqual(['call', 'text']);
  expect(projected.display.data.parts?.[0]).toMatchObject({ state: 'input-streaming' });
  expect(projected.attachments?.[0]).toMatchObject({ name: 'result.png', resource: 'pc-file' });
  expect(JSON.stringify(projected.display)).not.toContain('pc-file');
});
