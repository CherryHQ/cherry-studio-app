import type { AgentMessage } from '@cherrystudio/remote-protocol/agent';

import { projectMessage } from '../remoteAgentViews';

const failure = {
  message: 'An active OpenCode Go subscription is required to use Go models.',
  retryable: false,
  failure: { version: 1, reasonCode: 'permission', source: { layer: 'provider' } },
};

it('preserves a failed empty assistant message instead of presenting it as success', () => {
  const message = {
    messageId: 'assistant',
    revision: '2',
    role: 'assistant',
    partIds: [],
    status: 'error',
    failure,
  } as AgentMessage;
  expect(projectMessage('session', message, [], () => 'resource')).toMatchObject({
    id: 'assistant',
    state: 'error',
    failure,
  });
});
