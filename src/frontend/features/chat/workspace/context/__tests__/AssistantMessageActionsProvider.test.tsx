import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  AssistantMessageActionsProvider,
  useAssistantMessageActions,
  useAssistantMessageActionsState,
} from '../AssistantMessageActionsProvider';

const mockSetStringAsync = jest.fn(async (_text: string): Promise<void> => undefined);
const mockForkSession = jest.fn(async (_input: unknown): Promise<void> => undefined);
const mockAlertShow = jest.fn();
const mockLoggerError = jest.fn();
let mockSourceTitle: string | undefined;

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('../../../runtime', () => ({
  useAgentChatFork: () => mockForkSession,
}));

jest.mock('@/frontend/hooks/agent', () => ({
  useAgentSession: () => ({ data: { title: mockSourceTitle } }),
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
  useAlert: () => ({ alert: { show: mockAlertShow } }),
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

function ProviderHarness({ probeRef }: { probeRef: Ref<ContextProbeHandle> }) {
  return (
    <AssistantMessageActionsProvider isAssistantToolbarEnabled sessionId="session-1">
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
    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'chat.messageActions.copyFailed' });
  });

  test('routes fork failures to logging and user feedback', async () => {
    const error = new Error('fork failed');
    mockForkSession.mockRejectedValueOnce(error);
    renderProvider();

    await act(async () => {
      probeRef.current?.actions.forkFromAssistantMessage({ messageId: 'assistant-1' });
      await Promise.resolve();
    });

    expect(mockForkSession).toHaveBeenCalledWith({
      fromMessageId: 'assistant-1',
      sessionId: 'session-1',
      title: 'chat.fork.sessionTitle:Arithmetic drills',
    });
    expect(mockLoggerError).toHaveBeenCalledWith('Fork assistant message failed', error);
    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'chat.messageActions.forkFailed' });
  });

  test('leaves an unnamed source unnamed instead of forking it to a bare prefix', async () => {
    // A prefix with nothing after it would also be non-empty, which permanently
    // disqualifies the fork from auto-naming.
    mockSourceTitle = '   ';
    renderProvider();

    await act(async () => {
      probeRef.current?.actions.forkFromAssistantMessage({ messageId: 'assistant-1' });
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
    expect(mockAlertShow).not.toHaveBeenCalled();
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
    expect(mockAlertShow).not.toHaveBeenCalled();
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
