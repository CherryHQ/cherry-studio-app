import { createRef, type ReactNode, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import {
  AssistantMessageActionsProvider,
  useAssistantMessageActionCommands,
  useAssistantMessageActionState,
} from '../AssistantMessageActionsProvider';

const mockSetStringAsync = jest.fn(async (_text: string): Promise<void> => undefined);
const mockAlertShow = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
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
  commands: ReturnType<typeof useAssistantMessageActionCommands>;
  state: ReturnType<typeof useAssistantMessageActionState>;
};

function ContextProbe({ ref }: { ref: Ref<ContextProbeHandle> }) {
  const commands = useAssistantMessageActionCommands();
  const state = useAssistantMessageActionState();
  useImperativeHandle(ref, () => ({ commands, state }), [commands, state]);
  return null;
}

function ProviderHarness({
  children,
  isRegenerateDisabled = false,
  onRegenerate,
  probeRef,
}: {
  children?: ReactNode;
  isRegenerateDisabled?: boolean;
  onRegenerate: (input: { messageId: string }) => Promise<unknown>;
  probeRef: Ref<ContextProbeHandle>;
}) {
  return (
    <AssistantMessageActionsProvider
      isRegenerateDisabled={isRegenerateDisabled}
      onRegenerate={onRegenerate}
    >
      <ContextProbe ref={probeRef} />
      {children}
    </AssistantMessageActionsProvider>
  );
}

describe('AssistantMessageActionsProvider', () => {
  let renderer: ReactTestRenderer | undefined;
  const onRegenerate = jest.fn(
    async (_input: { messageId: string }): Promise<unknown> => undefined,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    jest.useRealTimers();
  });

  test('keeps commands stable while copied feedback updates and expires', async () => {
    const probeRef = createRef<ContextProbeHandle>();
    act(() => {
      renderer = create(<ProviderHarness onRegenerate={onRegenerate} probeRef={probeRef} />);
    });
    const commandsAtMount = probeRef.current?.commands;

    await act(async () => {
      probeRef.current?.commands.copyAssistantMessage({
        messageId: 'assistant-1',
        text: 'Answer',
      });
      await Promise.resolve();
    });

    expect(mockSetStringAsync).toHaveBeenCalledWith('Answer');
    expect(probeRef.current?.state.copiedMessageId).toBe('assistant-1');
    expect(probeRef.current?.commands).toBe(commandsAtMount);

    act(() => jest.advanceTimersByTime(1_200));

    expect(probeRef.current?.state.copiedMessageId).toBeUndefined();
    expect(probeRef.current?.commands).toBe(commandsAtMount);
  });

  test('updates busy state without changing the commands context', () => {
    const probeRef = createRef<ContextProbeHandle>();
    act(() => {
      renderer = create(<ProviderHarness onRegenerate={onRegenerate} probeRef={probeRef} />);
    });
    const commandsAtMount = probeRef.current?.commands;

    act(() => {
      renderer?.update(
        <ProviderHarness isRegenerateDisabled onRegenerate={onRegenerate} probeRef={probeRef} />,
      );
    });

    expect(probeRef.current?.state.isRegenerateDisabled).toBe(true);
    expect(probeRef.current?.commands).toBe(commandsAtMount);
  });

  test('routes copy failures to logging and user feedback', async () => {
    const probeRef = createRef<ContextProbeHandle>();
    const error = new Error('copy failed');
    mockSetStringAsync.mockRejectedValueOnce(error);
    act(() => {
      renderer = create(<ProviderHarness onRegenerate={onRegenerate} probeRef={probeRef} />);
    });

    await act(async () => {
      probeRef.current?.commands.copyAssistantMessage({
        messageId: 'assistant-1',
        text: 'Answer',
      });
      await Promise.resolve();
    });

    expect(mockLoggerError).toHaveBeenCalledWith('Copy assistant message failed', error);
    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'chat.messageActions.copyFailed' });
  });

  test('ignores a pending copy after unmount', async () => {
    const probeRef = createRef<ContextProbeHandle>();
    const clipboardWrite = createDeferred<void>();
    mockSetStringAsync.mockReturnValueOnce(clipboardWrite.promise);
    act(() => {
      renderer = create(<ProviderHarness onRegenerate={onRegenerate} probeRef={probeRef} />);
    });

    act(() => {
      probeRef.current?.commands.copyAssistantMessage({
        messageId: 'assistant-1',
        text: 'Answer',
      });
      renderer?.unmount();
      renderer = undefined;
    });
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    setTimeoutSpy.mockClear();
    await act(async () => clipboardWrite.resolve());

    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 1_200);
    expect(mockAlertShow).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  test('keeps only the latest copy feedback timer', async () => {
    const probeRef = createRef<ContextProbeHandle>();
    act(() => {
      renderer = create(<ProviderHarness onRegenerate={onRegenerate} probeRef={probeRef} />);
    });

    await act(async () => {
      probeRef.current?.commands.copyAssistantMessage({ messageId: 'assistant-1', text: 'First' });
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(600));
    await act(async () => {
      probeRef.current?.commands.copyAssistantMessage({ messageId: 'assistant-2', text: 'Second' });
      await Promise.resolve();
    });

    act(() => jest.advanceTimersByTime(600));
    expect(probeRef.current?.state.copiedMessageId).toBe('assistant-2');

    act(() => jest.advanceTimersByTime(600));
    expect(probeRef.current?.state.copiedMessageId).toBeUndefined();
  });

  test('expires existing feedback while a newer copy is pending', async () => {
    const probeRef = createRef<ContextProbeHandle>();
    const pendingClipboardWrite = createDeferred<void>();
    act(() => {
      renderer = create(<ProviderHarness onRegenerate={onRegenerate} probeRef={probeRef} />);
    });

    await act(async () => {
      probeRef.current?.commands.copyAssistantMessage({ messageId: 'assistant-1', text: 'First' });
      await Promise.resolve();
    });
    mockSetStringAsync.mockReturnValueOnce(pendingClipboardWrite.promise);
    act(() => {
      probeRef.current?.commands.copyAssistantMessage({ messageId: 'assistant-2', text: 'Second' });
      jest.advanceTimersByTime(1_200);
    });

    expect(probeRef.current?.state.copiedMessageId).toBeUndefined();
  });

  test('routes regenerate failures to logging and user feedback', async () => {
    const probeRef = createRef<ContextProbeHandle>();
    const error = new Error('regenerate failed');
    onRegenerate.mockRejectedValueOnce(error);
    act(() => {
      renderer = create(<ProviderHarness onRegenerate={onRegenerate} probeRef={probeRef} />);
    });

    await act(async () => {
      probeRef.current?.commands.regenerateAssistantMessage('assistant-1');
      await Promise.resolve();
    });

    expect(onRegenerate).toHaveBeenCalledWith({ messageId: 'assistant-1' });
    expect(mockAlertShow).toHaveBeenCalledWith({
      title: 'chat.messageActions.regenerateFailed',
    });
  });

  test('ignores a pending regenerate failure after unmount', async () => {
    const probeRef = createRef<ContextProbeHandle>();
    const regeneration = createDeferred<unknown>();
    onRegenerate.mockReturnValueOnce(regeneration.promise);
    act(() => {
      renderer = create(<ProviderHarness onRegenerate={onRegenerate} probeRef={probeRef} />);
    });

    act(() => {
      probeRef.current?.commands.regenerateAssistantMessage('assistant-1');
      renderer?.unmount();
      renderer = undefined;
    });
    await act(async () => regeneration.reject(new Error('regenerate failed')));

    expect(mockAlertShow).not.toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
  });
});
