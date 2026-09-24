import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { OperationOutcome } from '@/frontend/appShell/conversation';
import { localConversationFailure } from '@/frontend/appShell/conversation/local/localConversationFailure';
import { AgentProtocolError, type AgentErrorView } from '@/shared/contracts/agent';

import {
  AssistantMessageActionsProvider,
  ChatMessageActionsProvider,
  useAssistantMessageActions,
  useAssistantMessageActionsState,
} from '../AssistantMessageActionsProvider';

let mockRetryOutcome: OperationOutcome<void>;
const mockSetStringAsync = jest.fn(async (_text: string): Promise<void> => undefined);
const mockRetryMessage = jest.fn(async (_input: unknown): Promise<void> => undefined);
const mockForkSession = jest.fn(async (_input: unknown): Promise<void> => undefined);
const mockDeleteTurn = jest.fn(async (_input: unknown): Promise<void> => undefined);
/** Captures the confirm request so a test can accept it the way a user would. */
const mockAlertConfirm = jest.fn<void, [{ onConfirm: () => void }]>();
const mockToastShow = jest.fn();
const mockShare = jest.fn();
let mockFocusEffect: (() => void) | undefined;
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (effect: () => void) => {
    mockFocusEffect = effect;
    effect();
  },
}));
const mockLoggerError = jest.fn();
let mockSourceTitle: string | undefined;

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

// Interpolating stub: the fork title is composed here, so a key-only `t` would
// hide whether the source name actually reaches it.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}:${Object.values(values).join(',')}` : key,
  }),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockAlertConfirm } }),
  useToast: () => ({ toast: { show: mockToastShow } }),
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

function ProviderHarness({ probeRef }: { probeRef: Ref<ContextProbeHandle> }) {
  return (
    <AssistantMessageActionsProvider
      isAssistantToolbarEnabled
      retryableMessageId="assistant-1"
      onShare={mockShare}
      snapshot={{
        title: mockSourceTitle ?? '',
        freshness: { state: 'current' },
        liveMessages: [],
        interactions: [],
        executions: [],
      }}
      messages={[
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
    jest.useFakeTimers();
    mockSourceTitle = 'Arithmetic drills';
    mockRetryOutcome = { state: 'applied', value: undefined };
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

  function startCopy(messageId: string, text: string) {
    act(() => probeRef.current?.actions.copyAssistantMessage({ messageId, text }));
  }

  async function copyAndFlush(messageId: string, text: string) {
    await act(async () => {
      probeRef.current?.actions.copyAssistantMessage({ messageId, text });
      await Promise.resolve();
    });
  }

  function unmountProvider() {
    act(() => renderer?.unmount());
    renderer = undefined;
  }

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

  test('opens selection at the clicked answer without changing the transcript', () => {
    renderProvider();
    act(() => probeRef.current?.actions.shareAssistantMessage({ messageId: 'answer' }));
    expect(mockShare).toHaveBeenCalledWith('answer');
    expect(mockRetryMessage).not.toHaveBeenCalled();
  });

  test('ignores repeated share taps until the chat regains focus', () => {
    renderProvider();
    act(() => {
      probeRef.current?.actions.shareAssistantMessage({ messageId: 'answer-1' });
      probeRef.current?.actions.shareAssistantMessage({ messageId: 'answer-2' });
    });

    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith('answer-1');

    act(() => mockFocusEffect?.());
    act(() => probeRef.current?.actions.shareAssistantMessage({ messageId: 'answer-3' }));
    expect(mockShare).toHaveBeenCalledTimes(2);
  });

  test('shows copied feedback until it expires', async () => {
    renderProvider();

    await copyAndFlush('assistant-1', 'Answer');

    expect(mockSetStringAsync).toHaveBeenCalledWith('Answer');
    expect(probeRef.current?.state.copiedMessageId).toBe('assistant-1');

    act(() => jest.advanceTimersByTime(1_200));

    expect(probeRef.current?.state.copiedMessageId).toBeUndefined();
  });

  test('routes copy failures to logging and user feedback', async () => {
    const error = new Error('copy failed');
    mockSetStringAsync.mockRejectedValueOnce(error);
    renderProvider();

    await copyAndFlush('assistant-1', 'Answer');

    expect(mockLoggerError).toHaveBeenCalledWith('Copy assistant message failed', error);
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'chat.messageActions.copyFailed',
      variant: 'danger',
    });
  });

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

    act(() => probeRef.current?.actions.deleteMessageTurn!({ turnId: 'turn-1' }));

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

    act(() => probeRef.current?.actions.deleteMessageTurn!({ turnId: 'turn-1' }));
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

    startCopy('assistant-1', 'First');
    await copyAndFlush('assistant-2', 'Second');
    await act(async () => firstClipboardWrite.reject(error));

    expect(mockLoggerError).toHaveBeenCalledWith('Copy assistant message failed', error);
    expect(mockToastShow).not.toHaveBeenCalled();
  });

  test('ignores a pending copy after unmount', async () => {
    const clipboardWrite = createDeferred<void>();
    mockSetStringAsync.mockReturnValueOnce(clipboardWrite.promise);
    renderProvider();

    startCopy('assistant-1', 'Answer');
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
