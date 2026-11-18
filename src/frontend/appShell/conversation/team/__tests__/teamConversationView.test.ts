import type { TeamConversation, TeamMessage } from '@/shared/contracts/teamAgent';

import { createTeamConversationProjector } from '../teamConversationView';

it('namespaces server IDs and keeps file-like remote tools inside the readonly projection', () => {
  const message: TeamMessage = {
    id: 'message',
    role: 'assistant',
    status: 'success',
    parts: [{ type: 'tool', id: 'call' }],
    tools: [
      {
        id: 'call',
        name: 'read_file',
        state: 'completed',
        input: '/private/path',
        output: 'remote output',
      },
    ],
  };
  const state = {
    phase: 'current' as const,
    submitting: false,
    view: {
      messages: [message],
      run: null,
      pending: [],
      canSend: true,
      canStop: false,
      canRespond: false,
    },
  };
  const first = createTeamConversationProjector('account/session-a')(
    state,
    {} as TeamConversation,
    'agent',
    '',
  );
  const second = createTeamConversationProjector('account/session-b')(
    state,
    {} as TeamConversation,
    'agent',
    '',
  );
  expect(first.liveMessages[0].key).not.toBe(second.liveMessages[0].key);
  expect(first.liveMessages[0].display.data.parts?.[0]).toMatchObject({
    toolName: 'team_tool',
    input: undefined,
  });
  expect(first.liveMessages[0].tools).toMatchObject([
    {
      title: 'read_file',
      input: { kind: 'inline', value: { kind: 'json', value: '/private/path' } },
    },
  ]);
  expect(first.liveMessages[0].actions).toEqual({});
});
