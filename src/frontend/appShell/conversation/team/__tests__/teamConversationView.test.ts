import type {
  TeamConversation,
  TeamConversationState,
  TeamMessage,
} from '@/shared/contracts/teamAgent';

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

it.each([
  ['approval', 'awaiting-approval', 'decision'],
  ['clarify', 'awaiting-input', 'question'],
] as const)(
  'surfaces pending %s to respond only when authorized',
  async (kind, execution, interaction) => {
    const state: TeamConversationState = {
      phase: 'current',
      submitting: false,
      view: {
        messages: [],
        run: { id: 'run', state: 'running' },
        pending: [{ id: 'pending', requestId: 'run', kind, text: 'Reply' }],
        canSend: false,
        canStop: false,
        canRespond: false,
      },
    };
    const respond = jest.fn(async () => {});
    const conversation = { respond } as unknown as TeamConversation;
    const project = createTeamConversationProjector('session');
    const readonly = project(state, conversation, 'agent', '');
    expect(readonly.executions[0].state).toBe(execution);
    expect(readonly.interactions).toEqual([]);

    const writable = project(
      { ...state, view: { ...state.view!, canRespond: true } },
      conversation,
      'agent',
      '',
    );
    expect(writable.interactions).toMatchObject([{ id: 'pending', kind: interaction }]);
    await writable.interactions[0].respond!.execute(
      kind === 'approval'
        ? { kind: 'approve' }
        : { kind: 'answer', answers: { question: 'answer' } },
    );
    expect(respond).toHaveBeenCalledWith(
      'pending',
      'run',
      kind === 'approval' ? { decision: 'allow' } : { text: 'answer' },
    );
  },
);
