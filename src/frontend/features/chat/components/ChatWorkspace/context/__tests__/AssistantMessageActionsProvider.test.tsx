import { createRef, type Ref, useImperativeHandle } from 'react';
import { Keyboard } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { OperationOutcome } from '@/frontend/appShell/conversation';
import { localConversationFailure } from '@/frontend/appShell/conversation/local/localConversationFailure';
import { AgentProtocolError, type AgentErrorView } from '@/shared/contracts/agent';
import {
  DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG,
  type AssistantMessageToolbarConfig,
} from '@/shared/data/types/assistantMessageToolbar';

import {
  ChatShareSelectionStoreContext,
  createChatShareSelectionStore,
} from '../../../../share/chatShareSelection';
import {
  AssistantMessageActionsProvider,
  ChatMessageActionsProvider,
  useAssistantMessageActions,
  useAssistantMessageActionsState,
} from '../AssistantMessageActionsProvider';

let mockRetryOutcome: OperationOutcome<void>;
let mockEditOutcome: OperationOutcome<void>;
let mockQuestionEnabled = true;
let mockAnswerEnabled = true;
const mockSetStringAsync = jest.fn(async (_text: string): Promise<void> => undefined);
const mockRetryMessage = jest.fn(async (_input: unknown): Promise<void> => undefined);
const mockEditMessage = jest.fn(async (_input: unknown): Promise<void> => undefined);
const mockBeginEdit = jest.fn();
const mockEndEdit = jest.fn();
const mockForkSession = jest.fn(async (_input: unknown): Promise<void> => undefined);
const mockDeleteTurn = jest.fn(async (_input: unknown): Promise<void> => undefined);
/** Captures the confirm request so a test can accept it the way a user would. */
const mockAlertConfirm = jest.fn<void, [{ onConfirm: () => void }]>();
const mockToastShow = jest.fn();
const mockShare = jest.fn();
jest.mock('../../translation/MessageTranslationProvider', () => ({
  useMessageTranslationStore: () => null,
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), replace: jest.fn() },
}));
const mockLoggerError = jest.fn();
let mockSourceTitle: string | undefined;

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

// Interpolating stub: the fork title is composed here, so a key-only `t` would
// hide whether the source name actually reaches it. These stubs stay stable
// across renders like the real hooks, so identity assertions measure the provider.
const mockTranslation = {
  t: (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
};
jest.mock('react-i18next', () => ({
  useTranslation: () => mockTranslation,
}));

const mockAlert = {
  alert: { confirm: (input: { onConfirm: () => void }) => mockAlertConfirm(input) },
};
const mockToast = { toast: { show: (input: unknown) => mockToastShow(input) } };
jest.mock('@/frontend/components/ModelPicker', () => ({ ModelPickerDrawer: () => null }));
jest.mock('../../../../context/ChatEditingProvider', () => ({
  useChatEditing: () => ({ editing: null, beginEdit: mockBeginEdit, endEdit: mockEndEdit }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => mockAlert,
  useToast: () => mockToast,
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({ error: (...args: unknown[]) => mockLoggerError(...args) }),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

type ContextProbeHandle = {
  actions: ReturnType<typeof useAssistantMessageActions>;
  state: ReturnType<typeof useAssistantMessageActionsState>;
};

function ContextProbe({ ref }: { ref: Ref<ContextProbeHandle> }) {
  const actions = useAssistantMessageActions();
  const state = useAssistantMessageActionsState();
  useImperativeHandle(ref, () => ({ actions, state }), [actions, state]);
  return null;
}

const sessionRef = { source: { kind: 'local' as const }, sessionId: 'session-1' };

function ProviderHarness({
  probeRef,
  isSubmitting = false,
}: {
  probeRef: Ref<ContextProbeHandle>;
  isSubmitting?: boolean;
}) {
  return (
    <AssistantMessageActionsProvider
      isAssistantToolbarEnabled
      onShare={mockShare}
      snapshot={{
        isSubmitting,
        title: mockSourceTitle ?? '',
        freshness: { state: 'current' },
        liveMessages: [],
        interactions: [],
        executions: [],
      }}
      messages={[
        {
          key: 'user-1',
          state: 'success',
          completeness: 'complete',
          display: {
            id: 'user-1',
            role: 'user',
            status: 'success',
            turnId: 'turn-1',
            data: {
              parts: [{ type: 'text', text: 'Question' }],
            },
          },
          actions: {
            editQuestion: {
              availability: mockQuestionEnabled
                ? { state: 'enabled' }
                : { state: 'disabled', reason: 'busy' },
              execute: async ({ text }) => {
                await mockEditMessage({ messageId: 'user-1', text });
                return mockEditOutcome;
              },
            },
          },
        },
        {
          key: 'assistant-1',
          state: 'success',
          completeness: 'complete',
          display: {
            id: 'assistant-1',
            role: 'assistant',
            status: 'success',
            turnId: 'turn-1',
            data: {},
          },
          actions: {
            editAnswer: {
              availability: mockAnswerEnabled
                ? { state: 'enabled' }
                : { state: 'disabled', reason: 'busy' },
            },
            retry: { availability: { state: 'enabled' }, execute: async () => mockRetryOutcome },
            remove: {
              availability: { state: 'enabled' },
              execute: async () => {
                await mockDeleteTurn({ sessionId: 'session-1', turnId: 'turn-1' });
                return { state: 'applied', value: undefined };
              },
            },
            fork: {
              availability: { state: 'enabled' },
              execute: async ({ title }) => {
                await mockForkSession({
                  fromMessageId: 'assistant-1',
                  sessionId: 'session-1',
                  title,
                });
                return { state: 'applied', value: sessionRef };
              },
            },
          },
        },
      ]}
    >
      <ContextProbe ref={probeRef} />
    </AssistantMessageActionsProvider>
  );
}

describe('AssistantMessageActionsProvider', () => {
  let renderer: ReactTestRenderer | undefined;
  let probeRef = createRef<ContextProbeHandle>();

  beforeEach(() => {
    jest.clearAllMocks();
    mockToolbarConfig = DEFAULT_ASSISTANT_MESSAGE_TOOLBAR_CONFIG;
    mockSetToolbarConfig.mockResolvedValue(undefined);
    jest.useFakeTimers();
    mockSourceTitle = 'Arithmetic drills';
    mockQuestionEnabled = true;
    mockAnswerEnabled = true;
    mockRetryOutcome = { state: 'applied', value: undefined };
    mockEditOutcome = { state: 'applied', value: undefined };
    probeRef = createRef<ContextProbeHandle>();
  });

  afterEach(() => {
    unmountProvider();
    jest.useRealTimers();
  });

  function renderProvider() {
    act(() => {
      renderer = create(<ProviderHarness probeRef={probeRef} />);
    });
  }

  test('reads toolbar preferences once per provider and shares normalized state', () => {
    mockToolbarConfig = { pinned: ['share'], overflow: ['copy', 'delete'] };
    renderProvider();
    expect(mockUsePreference).toHaveBeenCalledTimes(1);
    expect(mockUsePreference).toHaveBeenCalledWith('ui.chat.assistant_toolbar_actions');
    expect(probeRef.current!.state.toolbarConfig.pinned).toEqual(['share']);
    expect(probeRef.current!.state.toolbarConfig.overflow).toEqual([
      'copy',
      'readAloud',
      'retry',
      'answerWith',
      'fork',
      'edit',
      'translate',
      'delete',
    ]);
  });

  test('mounts the manager on demand and unmounts only after it finishes closing', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    renderProvider();
    expect(renderer!.root.findAllByType('AssistantToolbarManageSheet')).toHaveLength(0);
    act(() => probeRef.current!.actions.openToolbarManager());
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(true);
    act(() => renderer!.root.findByType('AssistantToolbarManageSheet').props.onClose());
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(false);
    act(() => renderer!.root.findByType('AssistantToolbarManageSheet').props.onClosed());
    expect(renderer!.root.findAllByType('AssistantToolbarManageSheet')).toHaveLength(0);
    act(() => probeRef.current!.actions.openToolbarManager());
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(true);
    dismiss.mockRestore();
  });

  test('persists manager changes immediately and reports rejected writes', async () => {
    renderProvider();
    act(() => probeRef.current!.actions.openToolbarManager());
    const next = {
      pinned: ['share'],
      overflow: ['copy', 'readAloud', 'retry', 'answerWith', 'fork', 'edit', 'translate', 'delete'],
    } satisfies AssistantMessageToolbarConfig;
    const sheet = renderer!.root.findByType('AssistantToolbarManageSheet');
    await act(async () => sheet.props.onChange(next));
    expect(mockSetToolbarConfig).toHaveBeenCalledWith(next, { optimistic: true });
    expect(mockToastShow).not.toHaveBeenCalled();
    mockSetToolbarConfig.mockRejectedValueOnce(new Error('write failed'));
    await act(async () => sheet.props.onChange(next));
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'common.reorderFailed',
      variant: 'danger',
    });
  });

  it('keeps question and answer editability separate', () => {
    mockQuestionEnabled = false;
    renderProvider();
    expect([...probeRef.current!.state.editableQuestionIds]).toEqual(['user-1']);
    expect([...probeRef.current!.state.editableAnswerIds]).toEqual(['assistant-1']);
    expect(probeRef.current!.state.isEditQuestionDisabled).toBe(true);
    expect(probeRef.current!.state.isEditAnswerDisabled).toBe(false);
    mockQuestionEnabled = true;
    mockAnswerEnabled = false;
    act(() => renderer!.update(<ProviderHarness probeRef={probeRef} />));
    expect(probeRef.current!.state.isEditQuestionDisabled).toBe(false);
    expect(probeRef.current!.state.isEditAnswerDisabled).toBe(true);
  });

  function startCopy(messageId: string, text: string, notifySuccess?: boolean) {
    act(() => probeRef.current?.actions.copyAssistantMessage({ messageId, text, notifySuccess }));
  }

  async function copyAndFlush(messageId: string, text: string, notifySuccess?: boolean) {
    await act(async () => {
      probeRef.current?.actions.copyAssistantMessage({ messageId, text, notifySuccess });
      await Promise.resolve();
    });
  }

  function unmountProvider() {
    act(() => renderer?.unmount());
    renderer = undefined;
  }

  test('disables message mutations while a retry is being prepared without an active execution', () => {
    renderProvider();
    expect(probeRef.current!.state.isRetryDisabled).toBe(false);
    act(() => renderer!.update(<ProviderHarness probeRef={probeRef} isSubmitting />));
    expect(probeRef.current!.state.isRetryDisabled).toBe(true);
    expect(probeRef.current!.state.isDeleteDisabled).toBe(true);
    act(() => renderer!.update(<ProviderHarness probeRef={probeRef} />));
    expect(probeRef.current!.state.isRetryDisabled).toBe(false);
  });

  test('remote presentation exposes copy and share without local transcript mutations', async () => {
    const share = jest.fn();
    act(() => {
      renderer = create(
        <ChatMessageActionsProvider isAssistantToolbarEnabled onShare={share}>
          <ContextProbe ref={probeRef} />
        </ChatMessageActionsProvider>,
      );
    });
    const { actions, state } = probeRef.current!;
    expect(actions.deleteMessageTurn).toBeUndefined();
    expect(actions.retryAssistantMessage).toBeUndefined();
    expect(actions.forkFromAssistantMessage).toBeUndefined();
    expect(state.isDeleteDisabled).toBe(true);
    expect(state.isRetryDisabled).toBe(true);
    await copyAndFlush('pc-answer', 'PC answer');
    expect(mockSetStringAsync).toHaveBeenCalledWith('PC answer');
    expect(probeRef.current!.state.copiedMessageId).toBe('pc-answer');
    act(() => actions.shareAssistantMessage({ messageId: 'pc-answer' }));
    expect(share).toHaveBeenCalledWith({ messageId: 'pc-answer' });
    expect(mockDeleteTurn).not.toHaveBeenCalled();
    expect(mockRetryMessage).not.toHaveBeenCalled();
  });

  test.each([
    ['AGENT_MODEL_NOT_CONFIGURED', 'chat.input.sendError.modelNotConfigured'],
    ['ATTACHMENT_UNAVAILABLE', 'chat.input.attachmentUnavailable'],
    ['TOOL_CALLING_UNSUPPORTED', 'chat.input.sendError.toolCallingUnsupported'],
    ['MESSAGE_NOT_FOUND', 'chat.messageActions.retryFailed'],
  ] as const)(
    'explains a retry rejection for %s without showing raw diagnostics',
    async (code, label) => {
      mockRetryOutcome = {
        state: 'rejected',
        failure: localConversationFailure(
          new AgentProtocolError({
            code,
            message: 'private diagnostic',
            retryable: false,
          } as AgentErrorView),
        ),
      };
      renderProvider();
      await act(async () => {
        probeRef.current!.actions.retryAssistantMessage!({ messageId: 'assistant-1' });
      });
      expect(mockToastShow).toHaveBeenCalledWith({ label, variant: 'danger' });
      expect(JSON.stringify(mockToastShow.mock.calls)).not.toContain('private diagnostic');
    },
  );

  test('keeps row actions stable across transcript updates and runs them on the latest data', async () => {
    renderProvider();
    const actions = probeRef.current?.actions;
    const state = probeRef.current?.state;

    // Every streamed chunk delivers a new transcript and snapshot. Rows read
    // these actions through context, so their identity must not follow it.
    mockSourceTitle = 'Renamed while streaming';
    act(() => renderer?.update(<ProviderHarness probeRef={probeRef} />));
    expect(probeRef.current?.actions).toBe(actions);
    expect(probeRef.current?.state).toBe(state);
    expect(probeRef.current?.actions.getSpeechContext?.()).toEqual({
      title: 'Renamed while streaming',
    });

    await act(async () => {
      probeRef.current?.actions.forkFromAssistantMessage?.({ messageId: 'assistant-1' });
      await Promise.resolve();
    });
    expect(mockForkSession).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'chat.fork.sessionTitle:Renamed while streaming' }),
    );
  });

  test('opens selection at the clicked answer without changing the transcript', () => {
    renderProvider();
    act(() => probeRef.current?.actions.shareAssistantMessage({ messageId: 'answer' }));
    expect(mockShare).toHaveBeenCalledWith('answer', undefined);
    expect(mockRetryMessage).not.toHaveBeenCalled();
  });

  test('starts composer edit mode with the question text', () => {
    renderProvider();
    act(() => probeRef.current?.actions.editQuestion!({ messageId: 'user-1' }));

    // The composer owns the editing session from here: it submits through the
    // chat controls and restores the typed edit when admission is rejected.
    expect(mockBeginEdit).toHaveBeenCalledWith({
      messageId: 'user-1',
      initialText: 'Question',
      attachmentCount: 0,
    });
  });

  test('disables message actions during share selection and restores them on cancellation', () => {
    const store = createChatShareSelectionStore();
    mockShare
      .mockImplementationOnce(store.beginSelection)
      .mockImplementationOnce(store.beginSelection);
    act(() => {
      renderer = create(
        <ChatShareSelectionStoreContext value={store}>
          <ProviderHarness probeRef={probeRef} />
        </ChatShareSelectionStoreContext>,
      );
    });
    expect(probeRef.current!.state.isAssistantToolbarEnabled).toBe(true);
    act(() => probeRef.current!.actions.openToolbarManager());
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(true);

    act(() => probeRef.current!.actions.shareAssistantMessage({ messageId: 'answer-1' }));
    expect(renderer!.root.findByType('AssistantToolbarManageSheet').props.open).toBe(false);
    act(() => renderer!.root.findByType('AssistantToolbarManageSheet').props.onClosed());
    expect(renderer!.root.findAllByType('AssistantToolbarManageSheet')).toHaveLength(0);
    expect(probeRef.current!.state).toMatchObject({
      isAssistantToolbarEnabled: false,
      isDeleteDisabled: true,
      isRetryDisabled: true,
    });
    act(() =>
      probeRef.current!.actions.deleteMessageTurn!({ turnId: 'turn-1', messageId: 'assistant-1' }),
    );
    expect(mockAlertConfirm).not.toHaveBeenCalled();

    act(() => store.cancelSelection());
    expect(probeRef.current!.state).toMatchObject({
      isAssistantToolbarEnabled: true,
      isDeleteDisabled: false,
      isRetryDisabled: false,
    });
    expect(renderer!.root.findAllByType('AssistantToolbarManageSheet')).toHaveLength(0);

    act(() => probeRef.current!.actions.shareAssistantMessage({ messageId: 'answer-2' }));
    expect(mockShare).toHaveBeenCalledTimes(2);
    expect(mockShare).toHaveBeenLastCalledWith('answer-2', undefined);
    expect(probeRef.current!.state.isAssistantToolbarEnabled).toBe(false);
  });

  test('shows copied feedback until it expires', async () => {
    renderProvider();

    await copyAndFlush('assistant-1', 'Answer');

    expect(mockSetStringAsync).toHaveBeenCalledWith('Answer');
    expect(probeRef.current?.state.copiedMessageId).toBe('assistant-1');
    expect(mockToastShow).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(1_200));

    expect(probeRef.current?.state.copiedMessageId).toBeUndefined();
  });

  test('confirms overflow copy only after the clipboard write succeeds', async () => {
    const clipboardWrite = createDeferred<void>();
    mockSetStringAsync.mockReturnValueOnce(clipboardWrite.promise);
    renderProvider();

    startCopy('assistant-1', 'Answer', true);
    expect(mockToastShow).not.toHaveBeenCalled();
    expect(probeRef.current!.state.copiedMessageId).toBeUndefined();
    await act(async () => clipboardWrite.resolve());

    expect(probeRef.current!.state.copiedMessageId).toBe('assistant-1');
    expect(mockToastShow).toHaveBeenCalledTimes(1);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.messageActions.copied',
      variant: 'success',
    });
  });

  test('ignores stale overflow copy success after a newer copy completes', async () => {
    const clipboardWrite = createDeferred<void>();
    mockSetStringAsync.mockReturnValueOnce(clipboardWrite.promise);
    renderProvider();

    startCopy('assistant-1', 'First', true);
    await copyAndFlush('assistant-2', 'Second');
    await act(async () => clipboardWrite.resolve());

    expect(probeRef.current!.state.copiedMessageId).toBe('assistant-2');
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  test.each([undefined, true])(
    'routes copy failures to logging and user feedback (notifySuccess=%p)',
    async (notifySuccess) => {
      const error = new Error('copy failed');
      mockSetStringAsync.mockRejectedValueOnce(error);
      renderProvider();

      await copyAndFlush('assistant-1', 'Answer', notifySuccess);

      expect(mockLoggerError).toHaveBeenCalledWith('Copy assistant message failed', error);
      expect(mockToastShow).toHaveBeenCalledWith({
        label: 'chat.messageActions.copyFailed',
        variant: 'danger',
      });
      expect(mockToastShow).toHaveBeenCalledTimes(1);
    },
  );

  test('routes fork failures to logging and user feedback', async () => {
    const error = new Error('fork failed');
    mockForkSession.mockRejectedValueOnce(error);
    renderProvider();

    await act(async () => {
      probeRef.current?.actions.forkFromAssistantMessage!({ messageId: 'assistant-1' });
      await Promise.resolve();
    });

    expect(mockForkSession).toHaveBeenCalledWith({
      fromMessageId: 'assistant-1',
      sessionId: 'session-1',
      title: 'chat.fork.sessionTitle:Arithmetic drills',
    });
    expect(mockLoggerError).toHaveBeenCalledWith('Conversation message action failed', error);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.messageActions.forkFailed',
      variant: 'danger',
    });
  });

  test('deletes a turn only after the destructive confirmation is accepted', async () => {
    renderProvider();

    act(() =>
      probeRef.current?.actions.deleteMessageTurn!({ turnId: 'turn-1', messageId: 'assistant-1' }),
    );

    // Nothing has happened yet: the alert is the gate, not a notification.
    expect(mockDeleteTurn).not.toHaveBeenCalled();
    expect(mockAlertConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: 'common.delete',
        description: 'chat.messageActions.deleteMessage',
        role: 'destructive',
        title: 'chat.messageActions.deleteTitle',
      }),
    );

    await act(async () => {
      mockAlertConfirm.mock.lastCall![0].onConfirm();
      await Promise.resolve();
    });

    expect(mockDeleteTurn).toHaveBeenCalledWith({ sessionId: 'session-1', turnId: 'turn-1' });
  });

  test('routes turn deletion failures to logging and user feedback', async () => {
    const error = new Error('delete failed');
    mockDeleteTurn.mockRejectedValueOnce(error);
    renderProvider();

    act(() =>
      probeRef.current?.actions.deleteMessageTurn!({ turnId: 'turn-1', messageId: 'assistant-1' }),
    );
    await act(async () => {
      mockAlertConfirm.mock.lastCall![0].onConfirm();
      await Promise.resolve();
    });

    expect(mockLoggerError).toHaveBeenCalledWith('Conversation message action failed', error);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.messageActions.deleteFailed',
      variant: 'danger',
    });
  });

  test('leaves an unnamed source unnamed instead of forking it to a bare prefix', async () => {
    // A prefix with nothing after it would also be non-empty, which permanently
    // disqualifies the fork from auto-naming.
    mockSourceTitle = '   ';
    renderProvider();

    await act(async () => {
      probeRef.current?.actions.forkFromAssistantMessage!({ messageId: 'assistant-1' });
      await Promise.resolve();
    });

    expect(mockForkSession).toHaveBeenCalledWith({
      fromMessageId: 'assistant-1',
      sessionId: 'session-1',
      title: undefined,
    });
  });

  test('logs a stale copy failure without showing outdated user feedback', async () => {
    const firstClipboardWrite = createDeferred<void>();
    const error = new Error('stale copy failed');
    mockSetStringAsync.mockReturnValueOnce(firstClipboardWrite.promise);
    renderProvider();

    startCopy('assistant-1', 'First', true);
    await copyAndFlush('assistant-2', 'Second');
    await act(async () => firstClipboardWrite.reject(error));

    expect(mockLoggerError).toHaveBeenCalledWith('Copy assistant message failed', error);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  test('ignores a pending copy after unmount', async () => {
    const clipboardWrite = createDeferred<void>();
    mockSetStringAsync.mockReturnValueOnce(clipboardWrite.promise);
    renderProvider();

    startCopy('assistant-1', 'Answer', true);
    unmountProvider();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    setTimeoutSpy.mockClear();
    await act(async () => clipboardWrite.resolve());

    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 1_200);
    expect(mockToastShow).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  test('keeps only the latest copy feedback timer', async () => {
    renderProvider();

    await copyAndFlush('assistant-1', 'First');
    act(() => jest.advanceTimersByTime(600));
    await copyAndFlush('assistant-2', 'Second');

    act(() => jest.advanceTimersByTime(600));
    expect(probeRef.current?.state.copiedMessageId).toBe('assistant-2');

    act(() => jest.advanceTimersByTime(600));
    expect(probeRef.current?.state.copiedMessageId).toBeUndefined();
  });

  test('expires existing feedback while a newer copy is pending', async () => {
    const pendingClipboardWrite = createDeferred<void>();
    renderProvider();

    await copyAndFlush('assistant-1', 'First');
    mockSetStringAsync.mockReturnValueOnce(pendingClipboardWrite.promise);
    startCopy('assistant-2', 'Second');
    act(() => jest.advanceTimersByTime(1_200));

    expect(probeRef.current?.state.copiedMessageId).toBeUndefined();
  });
});

let mockToolbarConfig: AssistantMessageToolbarConfig;
const mockSetToolbarConfig = jest.fn(
  async (_value: AssistantMessageToolbarConfig, _options: unknown) => undefined,
);
const mockUsePreference = jest.fn((_key: string) => [mockToolbarConfig, mockSetToolbarConfig]);
jest.mock('@/frontend/data/hooks', () => ({
  usePreference: (key: string) => mockUsePreference(key),
}));

jest.mock('../../components/AssistantToolbarManageSheet', () => ({
  AssistantToolbarManageSheet: (props: object) =>
    jest.requireActual('react').createElement('AssistantToolbarManageSheet', props),
}));
