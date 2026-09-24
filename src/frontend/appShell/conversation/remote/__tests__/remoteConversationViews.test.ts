import type { RemoteMessageView } from '@/shared/contracts/remoteAgent';

import type { ResourceRead } from '../../contracts';
import {
  remoteConversationFailure,
  remoteMessage,
  remoteTranscriptMessage,
} from '../remoteConversationViews';

const resource = (id: string): ResourceRead => ({
  kind: 'deferred',
  key: id,
  read: async () => ({ kind: 'text', text: id, complete: true }),
});

it('keeps the same provider failure in message presentation and exported history without duplicating data parts', () => {
  const failure = {
    message: 'Subscription required',
    retryable: false,
    failure: {
      version: 1 as const,
      reasonCode: 'permission' as const,
      source: { layer: 'provider' as const },
      context: { statusCode: 403 },
    },
  };
  const message: RemoteMessageView = {
    id: 'failed',
    version: '3',
    role: 'assistant',
    state: 'error',
    failure,
    parts: [{ id: 'legacy-error', kind: 'data', name: 'data-error', resource: 'resource' }],
  };
  const view = remoteMessage(message, resource);
  expect(view.display).toMatchObject({
    status: 'error',
    data: {
      parts: [
        {
          type: 'data-error',
          data: {
            code: 'EXECUTION_FAILED',
            reasonCode: 'permission',
            message: failure.message,
            context: { statusCode: 403 },
          },
        },
      ],
    },
  });
  expect(view.display.data.parts).toHaveLength(1);
  expect(remoteTranscriptMessage(message)).toMatchObject({
    status: 'error',
    parts: [{ type: 'error', error: { code: 'EXECUTION_FAILED', ...failure } }],
  });
});

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
  const projected = remoteMessage(message, resource);
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
  expect(projected.tools?.[0].output).toMatchObject({ kind: 'deferred', key: 'output-ref' });
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
    resource,
  );
  expect(projected.display.data.partKeys).toEqual(['call', 'text']);
  expect(projected.display.data.parts?.[0]).toMatchObject({ state: 'input-streaming' });
  expect(projected.attachments?.[0]).toEqual({
    key: 'file',
    name: 'result.png',
    mediaType: 'image/png',
  });
  expect(JSON.stringify(projected.display)).not.toContain('pc-file');
});

it('preserves known admission failure details instead of flattening them to internal', () => {
  expect(
    remoteConversationFailure({
      code: 'TARGET_UNAVAILABLE',
      detail: 'Agent has no model configured',
    }),
  ).toEqual({
    code: 'target-unavailable',
    retry: 'revise-input',
    detail: { code: 'TARGET_UNAVAILABLE', message: 'Agent has no model configured' },
  });
  expect(remoteConversationFailure(new Error('private implementation error'))).toEqual({
    code: 'internal',
    retry: 'none',
  });
});

it('keeps remote usage in the display and leaves absent usage unknown', () => {
  const message: RemoteMessageView = {
    id: 'm',
    version: '1',
    role: 'assistant',
    state: 'success',
    parts: [],
    usage: { totalTokens: 25, outputTokens: 0, cacheReadTokens: 10, durationMs: 200 },
  };
  expect(remoteMessage(message, resource).display.usage).toEqual(message.usage);
  expect(remoteMessage({ ...message, usage: undefined }, resource).display.usage).toBeUndefined();
});

it('renders the historical remote model identity even when the phone has no matching model', () => {
  const message: RemoteMessageView = {
    id: 'm',
    version: '1',
    role: 'assistant',
    state: 'success',
    parts: [],
    model: { modelId: 'model', providerId: 'desktop-provider', name: 'Historical model' },
  };
  expect(remoteMessage(message, resource).display.model).toEqual({
    id: 'desktop-provider::model',
    ...message.model,
  });
  expect(remoteMessage({ ...message, model: undefined }, resource).display.model).toBeUndefined();
});
