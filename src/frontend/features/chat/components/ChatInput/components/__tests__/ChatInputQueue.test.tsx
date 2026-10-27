import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AgentProtocolError, type AgentQueuedInput } from '@/shared/contracts/agent';

import { ChatInputQueue } from '../ChatInputQueue';

const mockToast = jest.fn();
const mockCancel = jest.fn();
const mockEdit = jest.fn();
const mockMove = jest.fn();
const mockSetDraft = jest.fn();
const mockAddAttachments = jest.fn();
const mockRemoveAttachment = jest.fn();
const mockBeginSendAttempt = jest.fn();
const mockOtherComposerAction = jest.fn();
let mockInputs: AgentQueuedInput[] = [];
let mockMutationId = 0;
jest.mock('uuid', () => ({ v7: () => `mutation-${++mockMutationId}` }));
jest.mock('../../../../runtime', () => ({
  useAgentChatClient: () => ({
    client: { cancelQueuedInput: mockCancel, editQueuedInput: mockEdit, moveQueuedInput: mockMove },
  }),
  useAgentQueuedInputs: () => mockInputs,
}));
jest.mock('@/frontend/components/Composer', () => ({
  useComposerActions: () => ({
    setDraft: mockSetDraft,
    addAttachments: mockAddAttachments,
    removeAttachment: mockRemoveAttachment,
    beginSendAttempt: mockBeginSendAttempt,
    endSendAttempt: mockOtherComposerAction,
    clearAttachments: mockOtherComposerAction,
    setAttachments: mockOtherComposerAction,
    replaceAttachment: mockOtherComposerAction,
  }),
}));
jest.mock('@/frontend/components/FileEntryPreview/FileEntryPreview', () => ({
  FileEntryPreview: (props: { entryId: string; variant?: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('Attachment', props),
}));
jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const host = (name: string) =>
    function MockControl({ children, ...props }: { children?: React.ReactNode }) {
      return React.createElement(name, props, children);
    };
  const Field = Object.assign(host('Field'), { Label: host('Label'), Error: host('FieldError') });
  return {
    ActionMenu: host('QueueMenu'),
    Button: host('QueueButton'),
    Surface: host('Surface'),
    Input: host('QueueField'),
    TextField: Field,
    BottomSheet: ({
      children,
      footer,
      ...props
    }: {
      children?: React.ReactNode;
      footer?: React.ReactNode;
    }) => React.createElement('Sheet', props, children, footer),
    useToast: () => ({ toast: { show: mockToast } }),
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { position?: number }) => {
      const catalog = jest.requireActual<Record<string, string>>(
        '@/frontend/i18n/locales/en-us.json',
      );
      return catalog[key]?.replace('{{position}}', String(options?.position)) ?? key;
    },
  }),
}));

const longText = `${'Long authored text. '.repeat(300)}TAIL_SENTINEL`;
function input(turnId = 'turn-1'): AgentQueuedInput {
  return {
    turnId,
    assistantMessageId: `assistant-${turnId}`,
    moveTargets: { earlier: null, later: 'assistant-next' },
    userMessage: {
      id: `user-${turnId}`,
      sessionId: 'session-1',
      parentId: null,
      turnId,
      role: 'user',
      status: 'pending',
      parts: [
        { id: 'text-1', type: 'text', text: longText, state: 'done' },
        {
          id: 'file-1',
          type: 'file',
          fileEntryId: 'entry-1',
          mediaType: 'image/png',
          purpose: 'input-attachment',
        },
        {
          id: 'text-2',
          type: 'text',
          text: 'After attachment\n  preserved whitespace ',
          state: 'done',
        },
        {
          id: 'file-2',
          type: 'file',
          fileEntryId: 'entry-2',
          mediaType: 'application/pdf',
          purpose: 'input-attachment',
        },
      ],
      modelId: null,
      inferenceSnapshot: {
        status: 'supported',
        snapshot: {
          version: 1,
          model: {
            uniqueModelId: 'provider::model',
            providerId: 'provider',
            modelId: 'model',
            name: 'Captured model',
          },
          parameters: { temperature: 0.4, maxOutputTokens: 1024 },
          tools: [],
        },
      },
      stats: null,
      createdAt: '2026-10-27T00:00:00.000Z',
      updatedAt: '2026-10-27T00:00:00.000Z',
    },
  };
}
let tree: ReactTestRenderer;
function menu() {
  return tree.root.findByType('QueueMenu' as never).props.items;
}
function action(id: string) {
  act(() =>
    menu()
      .find((item: { id: string }) => item.id === id)
      .onPress(),
  );
}
function fields() {
  return tree.root.findAllByType('QueueField' as never);
}
function change(index: number, text: string) {
  act(() => fields()[index]!.props.onChangeText(text));
}
async function save() {
  await act(async () => {
    tree.root
      .findAllByType('QueueButton' as never)
      .find((button) => button.props.children === 'Save')!
      .props.onPress();
  });
}
function rerender(sessionId = 'session-1') {
  act(() => tree.update(<ChatInputQueue sessionId={sessionId} />));
}
function renderedText() {
  return tree.root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children as string)
    .join('\n');
}

afterEach(() => {
  act(() => tree?.unmount());
  for (const untouched of [
    mockSetDraft,
    mockAddAttachments,
    mockRemoveAttachment,
    mockBeginSendAttempt,
    mockOtherComposerAction,
  ])
    expect(untouched).not.toHaveBeenCalled();
});
beforeEach(() => {
  jest.clearAllMocks();
  mockMutationId = 0;
  mockInputs = [input()];
  mockCancel.mockResolvedValue('withdrawn');
  mockEdit.mockResolvedValue({ status: 'updated' });
  mockMove.mockResolvedValue({ status: 'moved' });
  act(() => {
    tree = create(<ChatInputQueue sessionId="session-1" />);
  });
});

it('offers ordered actions, lane boundaries, an accessible position and a real menu target', () => {
  expect(
    menu().map(
      ({
        label,
        disabled,
        destructive,
      }: {
        label: string;
        disabled: boolean;
        destructive?: boolean;
      }) => ({ label, disabled, destructive }),
    ),
  ).toEqual([
    { label: 'Edit', disabled: false },
    { label: 'Move earlier', disabled: true },
    { label: 'Move later', disabled: false },
    { label: 'Remove', disabled: false, destructive: true },
  ]);
  const trigger = tree.root.findByType('QueueButton' as never);
  expect(trigger.props).toMatchObject({
    accessibilityRole: 'button',
    accessibilityLabel: 'Actions for queued message 1',
    accessibilityState: { disabled: false, busy: false },
    size: 'lg',
  });
  mockInputs = [{ ...input(), moveTargets: { earlier: 'previous', later: null } }];
  rerender();
  expect(menu()[1].disabled).toBe(false);
  expect(menu()[2].disabled).toBe(true);
});

it('keeps Remove on the cancellation API and disables every action while the row is pending', async () => {
  let finish!: (outcome: string) => void;
  mockCancel.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  action('remove');
  expect(mockCancel).toHaveBeenCalledWith('session-1', 'turn-1');
  expect(menu().every((item: { disabled: boolean }) => item.disabled)).toBe(true);
  expect(tree.root.findByType('QueueButton' as never).props.accessibilityState).toEqual({
    disabled: true,
    busy: true,
  });
  await act(async () => finish('already-started'));
  expect(mockToast).toHaveBeenCalledWith({ label: 'This message has already started.' });
});

it('previews every authored text part without a 4000-character cap and every openable attachment', () => {
  act(() => tree.root.findByProps({ testID: 'queue-preview-turn-1' }).props.onPress());
  expect(renderedText()).toContain(longText);
  expect(renderedText()).toContain('TAIL_SENTINEL');
  expect(tree.root.findAllByType('Attachment' as never).map((file) => file.props)).toEqual([
    { entryId: 'entry-1', variant: 'attachment' },
    { entryId: 'entry-2', variant: 'attachment' },
  ]);
  const textNodes = tree.root.findAll((node) => node.props.selectable === true);
  expect(textNodes.some((node) => node.props.children === longText)).toBe(true);
});

it('saves exact authored slots around attachments using opening CAS values and no settings or files', async () => {
  action('edit');
  expect(fields()).toHaveLength(2);
  expect(renderedText()).toContain('Attachments and execution settings are read-only.');
  expect(renderedText()).toContain('Captured model');
  change(0, ' First changed\n');
  change(1, 'Second changed ');
  await save();
  expect(mockEdit).toHaveBeenCalledWith('session-1', {
    turnId: 'turn-1',
    assistantMessageId: 'assistant-turn-1',
    mutationId: 'mutation-1',
    parts: [
      { partId: 'text-1', expectedText: longText, text: ' First changed\n' },
      {
        partId: 'text-2',
        expectedText: 'After attachment\n  preserved whitespace ',
        text: 'Second changed ',
      },
    ],
  });
  expect(tree.root.findAllByType('Sheet' as never)).toHaveLength(0);
  expect(mockToast).toHaveBeenCalledWith({ label: 'Queued message saved.', variant: 'success' });
});

it('retains a dirty buffer on incoming updates, stale conflict and closing/reopening; shows confirmed text', async () => {
  action('edit');
  change(0, 'My unsaved buffer');
  const changed = input();
  changed.userMessage.parts[0] = {
    id: 'text-1',
    type: 'text',
    text: 'Latest confirmed content',
    state: 'done',
  };
  mockInputs = [changed];
  rerender();
  expect(fields()[0]!.props.value).toBe('My unsaved buffer');
  mockEdit.mockResolvedValue({ status: 'conflict', reason: 'stale-text' });
  await save();
  expect(renderedText()).toContain(
    'The queue changed. Your edits are kept. Review the latest confirmed text below.',
  );
  expect(renderedText()).toContain('Latest confirmed content');
  expect(fields()[0]!.props.value).toBe('My unsaved buffer');
  act(() => tree.root.findByType('Sheet' as never).props.onClose());
  action('edit');
  expect(fields()[0]!.props.value).toBe('My unsaved buffer');
  expect(mockEdit.mock.calls[0][1].parts[0].expectedText).toBe(longText);
});

it('offers a working retry with the identical buffer and a fresh mutation ID on a retryable rejection', async () => {
  action('edit');
  change(0, 'Retry this exact text');
  mockEdit.mockRejectedValueOnce(
    new AgentProtocolError({
      code: 'EXECUTION_FAILED',
      message: 'DO_NOT_RENDER_DIAGNOSTIC',
      retryable: true,
    }),
  );
  await save();
  const feedback = mockToast.mock.calls.at(-1)![0];
  expect(feedback).toMatchObject({
    variant: 'danger',
    actions: [{ label: 'Retry', onPress: expect.any(Function) }],
  });
  expect(fields()[0]!.props.value).toBe('Retry this exact text');
  expect(renderedText()).not.toContain('DO_NOT_RENDER_DIAGNOSTIC');
  await act(async () => feedback.actions[0].onPress());
  expect(mockEdit.mock.calls[1][1]).toEqual({
    ...mockEdit.mock.calls[0][1],
    mutationId: 'mutation-2',
  });
});

it('keeps the editor usable and its buffer after admission empties the queue and returns already-started', async () => {
  action('edit');
  change(0, 'Keep after admission');
  mockInputs = [];
  rerender();
  expect(fields()[0]!.props.value).toBe('Keep after admission');
  mockEdit.mockResolvedValue({ status: 'already-started' });
  await save();
  expect(fields()[0]!.props.value).toBe('Keep after admission');
  expect(fields()[0]!.props.disabled).toBe(false);
  change(0, 'Still editable');
  expect(fields()[0]!.props.value).toBe('Still editable');
  expect(mockToast).toHaveBeenCalledWith({ label: 'This message has already started.' });
});

it('keeps buffers separate by session and turn after reordering and reopening', () => {
  action('edit');
  change(0, 'Session one text');
  act(() => tree.root.findByType('Sheet' as never).props.onClose());
  rerender('session-2');
  action('edit');
  expect(fields()[0]!.props.value).toBe(longText);
  change(0, 'Session two text');
  act(() => tree.root.findByType('Sheet' as never).props.onClose());
  mockInputs = [input('turn-other'), input()];
  rerender();
  act(() => tree.root.findAllByType('QueueMenu' as never)[1]!.props.items[0].onPress());
  expect(fields()[0]!.props.value).toBe('Session one text');
});

it('blocks an empty message inline before making a request', async () => {
  mockInputs = [input()];
  mockInputs[0]!.userMessage.parts = mockInputs[0]!.userMessage.parts.filter(
    (part) => part.type === 'text',
  );
  rerender();
  action('edit');
  change(0, '  ');
  change(1, '\n');
  await save();
  expect(mockEdit).not.toHaveBeenCalled();
  expect(renderedText()).toContain('Enter some text or keep an attachment.');
});

it.each(['authored-text-unlocatable', 'invalid-text-layout', 'reference-conflict', 'not-found'])(
  'preserves edits and translates %s',
  async (reason) => {
    action('edit');
    change(0, 'Preserved');
    mockEdit.mockResolvedValue(
      reason === 'not-found' ? { status: reason } : { status: 'conflict', reason },
    );
    await save();
    expect(fields()[0]!.props.value).toBe('Preserved');
    expect(mockToast.mock.calls.at(-1)![0].label).toBe(
      reason === 'reference-conflict'
        ? 'The message’s references changed. Your edits are kept.'
        : reason === 'not-found'
          ? 'This message is no longer in the queue.'
          : 'This message cannot be edited safely. Remove it and resend it.',
    );
  },
);

it.each(['moved', 'already-applied', 'stale-neighbor', 'boundary', 'different-lane'])(
  'moves with the confirmed neighbor and reports %s without optimistic changes',
  async (reason) => {
    mockMove.mockResolvedValue(
      reason === 'moved'
        ? { status: 'moved' }
        : reason === 'already-applied'
          ? { status: 'unchanged', reason }
          : { status: 'conflict', reason },
    );
    await act(async () => menu()[2].onPress());
    expect(mockMove).toHaveBeenCalledWith('session-1', {
      turnId: 'turn-1',
      assistantMessageId: 'assistant-turn-1',
      mutationId: 'mutation-1',
      direction: 'later',
      expectedNeighborAssistantMessageId: 'assistant-next',
    });
    expect(mockToast.mock.calls.at(-1)![0].label).toBe(
      ['moved', 'already-applied'].includes(reason)
        ? 'Queued message moved.'
        : 'The queue order changed or this move is unavailable. Try again from the message menu.',
    );
    expect(mockInputs[0]!.turnId).toBe('turn-1');
  },
);

it.each(['same-text', 'already-applied'])(
  'closes the editor successfully for unchanged %s',
  async (reason) => {
    action('edit');
    mockEdit.mockResolvedValue({ status: 'unchanged', reason });
    await save();
    expect(tree.root.findAllByType('Sheet' as never)).toHaveLength(0);
    expect(mockToast).toHaveBeenCalledWith({ label: 'Queued message saved.', variant: 'success' });
  },
);

it('retains cancellation failure copy', async () => {
  mockCancel.mockRejectedValue(new Error('private diagnostic'));
  await act(async () => menu()[3].onPress());
  expect(mockToast).toHaveBeenCalledWith({
    label: "Couldn't remove the queued message.",
    variant: 'danger',
  });
});

it('disables the row actions and editor fields during an edit and retains the buffer after not-found', async () => {
  let finish!: (result: unknown) => void;
  mockEdit.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  action('edit');
  change(0, 'Pending buffer');
  await save();
  expect(menu().every((item: { disabled: boolean }) => item.disabled)).toBe(true);
  expect(fields().every((field) => field.props.disabled)).toBe(true);
  await act(async () => finish({ status: 'not-found' }));
  expect(fields()[0]!.props.value).toBe('Pending buffer');
  expect(fields()[0]!.props.disabled).toBe(false);
});

it('retries moves with the same neighbor precondition and a new mutation ID', async () => {
  mockMove.mockRejectedValueOnce(
    new AgentProtocolError({ code: 'EXECUTION_UNAVAILABLE', message: 'private', retryable: true }),
  );
  await act(async () => menu()[2].onPress());
  const feedback = mockToast.mock.calls.at(-1)![0];
  expect(feedback).toMatchObject({ variant: 'danger', actions: [{ label: 'Retry' }] });
  await act(async () => feedback.actions[0].onPress());
  expect(mockMove.mock.calls[1][1]).toEqual({
    ...mockMove.mock.calls[0][1],
    mutationId: 'mutation-2',
  });
});

it('shows attachment-only inputs read-only without sending an invalid empty part list', () => {
  mockInputs[0]!.userMessage.parts = mockInputs[0]!.userMessage.parts.filter(
    (part) => part.type === 'file',
  );
  rerender();
  action('edit');
  expect(fields()).toHaveLength(0);
  expect(tree.root.findAllByType('Attachment' as never)).toHaveLength(2);
  expect(
    tree.root
      .findAllByType('QueueButton' as never)
      .find((button) => button.props.children === 'Save')!.props.disabled,
  ).toBe(true);
  expect(mockEdit).not.toHaveBeenCalled();
});
