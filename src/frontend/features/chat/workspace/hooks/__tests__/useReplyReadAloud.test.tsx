import type { SpeechOptions } from 'expo-speech';
import { type EffectCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { type UseReplyReadAloudOptions, useReplyReadAloud } from '../useReplyReadAloud';

type Deferred<TValue> = {
  promise: Promise<TValue>;
  reject: (reason: unknown) => void;
  resolve: (value: TValue) => void;
};

type Utterance = {
  options: SpeechOptions;
  text: string;
};

const mockSpeak = jest.fn();
const mockStop = jest.fn();
const mockLoggerError = jest.fn();
const mockOnError = jest.fn();
let mockFocusCleanup: (() => void) | undefined;

jest.mock('expo-speech', () => ({
  maxSpeechInputLength: 112,
  speak: (...args: unknown[]) => mockSpeak(...args),
  stop: (...args: unknown[]) => mockStop(...args),
}));

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    const { useEffect } = jest.requireActual('react') as typeof import('react');
    useEffect(() => {
      const cleanup = effect();
      mockFocusCleanup = typeof cleanup === 'function' ? cleanup : undefined;

      return () => {
        if (mockFocusCleanup === cleanup) {
          mockFocusCleanup = undefined;
        }
        cleanup?.();
      };
    }, [effect]);
  },
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: {
    withContext: () => ({
      error: (...args: unknown[]) => mockLoggerError(...args),
    }),
  },
}));

type HookResult = ReturnType<typeof useReplyReadAloud>;

let appStateListener: ((state: string) => void) | undefined;
let latest: HookResult | undefined;
let renderer: ReactTestRenderer | undefined;
let stopRequests: Deferred<void>[] = [];
let utterances: Utterance[] = [];

function deferred<TValue>(): Deferred<TValue> {
  let reject!: (reason: unknown) => void;
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
}

function Probe(props: UseReplyReadAloudOptions) {
  const result = useReplyReadAloud(props);

  useEffect(() => {
    latest = result;
  }, [result]);

  return null;
}

function current(): HookResult {
  if (!latest) {
    throw new Error('The reply read-aloud hook did not render.');
  }
  return latest;
}

async function renderHook(overrides: Partial<UseReplyReadAloudOptions> = {}) {
  const options: UseReplyReadAloudOptions = {
    onError: mockOnError,
    topicId: 'topic-a',
    visibleMessageIds: ['a', 'b', 'c'],
    ...overrides,
  };

  await act(async () => {
    renderer = create(<Probe {...options} />);
  });

  return {
    rerender(nextOverrides: Partial<UseReplyReadAloudOptions>) {
      const nextOptions = { ...options, ...nextOverrides };
      act(() => renderer?.update(<Probe {...nextOptions} />));
    },
  };
}

function readAloud(messageId: string, text = `Reply ${messageId}`, language?: string) {
  act(() => current().readAloud({ language, messageId, text }));
}

async function resolveStop(index: number) {
  await act(async () => {
    stopRequests[index].resolve(undefined);
    await Promise.resolve();
  });
}

async function rejectStop(index: number, error: Error) {
  await act(async () => {
    stopRequests[index].reject(error);
    await Promise.resolve();
  });
}

describe('useReplyReadAloud', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    appStateListener = undefined;
    latest = undefined;
    mockFocusCleanup = undefined;
    renderer = undefined;
    stopRequests = [];
    utterances = [];

    mockStop.mockImplementation(() => {
      const request = deferred<void>();
      stopRequests.push(request);
      return request.promise;
    });
    mockSpeak.mockImplementation((text: string, options: SpeechOptions) => {
      utterances.push({ options, text });
    });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appStateListener = listener as (state: string) => void;
      return { remove: jest.fn() };
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('exposes starting immediately, clears native speech, and completes the session', async () => {
    await renderHook();

    readAloud('a');

    expect(current().activeMessageId).toBe('a');
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockSpeak).not.toHaveBeenCalled();

    await resolveStop(0);

    expect(utterances).toHaveLength(1);
    expect(utterances[0].text).toBe('Reply a');
    expect(Object.keys(utterances[0].options).sort()).toEqual([
      'onDone',
      'onError',
      'onStart',
      'onStopped',
    ]);

    act(() => utterances[0].options.onStart?.());
    expect(current().activeMessageId).toBe('a');

    act(() => utterances[0].options.onDone?.());
    expect(current().activeMessageId).toBeUndefined();
  });

  it('stops a starting session immediately and never starts it afterward', async () => {
    await renderHook();
    readAloud('a');

    readAloud('a');

    expect(current().activeMessageId).toBeUndefined();
    expect(mockStop).toHaveBeenCalledTimes(2);

    await resolveStop(0);
    await resolveStop(1);

    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it('lets only the latest rapid A/B/C intent start', async () => {
    await renderHook();

    readAloud('a');
    readAloud('b');
    readAloud('c');

    expect(current().activeMessageId).toBe('c');
    expect(stopRequests).toHaveLength(3);

    await resolveStop(1);
    await resolveStop(0);
    expect(mockSpeak).not.toHaveBeenCalled();

    await resolveStop(2);
    expect(utterances.map(({ text }) => text)).toEqual(['Reply c']);
  });

  it('ignores every stale native callback after a newer session starts', async () => {
    await renderHook();
    readAloud('a');
    await resolveStop(0);
    const first = utterances[0];

    readAloud('b');
    await resolveStop(1);
    expect(current().activeMessageId).toBe('b');

    act(() => {
      first.options.onStart?.();
      first.options.onDone?.();
      first.options.onStopped?.();
      first.options.onError?.(new Error('stale native error'));
    });

    expect(current().activeMessageId).toBe('b');
    expect(utterances.map(({ text }) => text)).toEqual(['Reply a', 'Reply b']);
    expect(mockOnError).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ message: 'stale native error' }),
    );
  });

  it('speaks chunks sequentially and advances each chunk exactly once', async () => {
    await renderHook();
    readAloud('a', 'abcdefghijklmnop');
    await resolveStop(0);

    expect(utterances.map(({ text }) => text)).toEqual(['abcdefghijkl']);

    act(() => utterances[0].options.onDone?.());
    expect(utterances.map(({ text }) => text)).toEqual(['abcdefghijkl', 'mnop']);

    act(() => utterances[0].options.onDone?.());
    expect(utterances).toHaveLength(2);

    act(() => utterances[1].options.onDone?.());
    expect(current().activeMessageId).toBeUndefined();
  });

  it('does not advance after onStopped, even if onDone arrives late', async () => {
    await renderHook();
    readAloud('a', 'abcdefghijklmnop');
    await resolveStop(0);

    act(() => utterances[0].options.onStopped?.());
    expect(current().activeMessageId).toBeUndefined();

    act(() => utterances[0].options.onDone?.());
    expect(utterances).toHaveLength(1);
  });

  it('passes only a provided language setting to every chunk', async () => {
    await renderHook();
    readAloud('a', 'abcdefghijklmnop', 'zh-CN');
    await resolveStop(0);

    expect(utterances[0].options.language).toBe('zh-CN');
    act(() => utterances[0].options.onDone?.());
    expect(utterances[1].options.language).toBe('zh-CN');
    expect(utterances[1].options).not.toEqual(
      expect.objectContaining({ pitch: expect.anything(), rate: expect.anything() }),
    );
    expect(utterances[1].options).not.toHaveProperty('voice');
    expect(utterances[1].options).not.toHaveProperty('volume');
  });

  it('reports an initial stop rejection once and logs cleanup rejection only', async () => {
    await renderHook();
    readAloud('a');

    const initialError = new Error('initial stop failed');
    await rejectStop(0, initialError);

    expect(current().activeMessageId).toBeUndefined();
    expect(mockSpeak).not.toHaveBeenCalled();
    expect(mockOnError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(expect.any(String), initialError);
    expect(stopRequests).toHaveLength(2);

    await rejectStop(1, new Error('cleanup failed'));
    expect(mockOnError).toHaveBeenCalledTimes(1);
  });

  it('reports a synchronous speak throw once and clears remaining speech', async () => {
    const speakError = new Error('speak threw');
    mockSpeak.mockImplementationOnce(() => {
      throw speakError;
    });
    await renderHook();
    readAloud('a');

    await resolveStop(0);

    expect(current().activeMessageId).toBeUndefined();
    expect(mockOnError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(expect.any(String), speakError);
    expect(stopRequests).toHaveLength(2);

    await rejectStop(1, new Error('cleanup failed'));
    expect(mockOnError).toHaveBeenCalledTimes(1);
  });

  it('reports the current chunk onError once and ignores its later callbacks', async () => {
    await renderHook();
    readAloud('a', 'abcdefghijklmnop');
    await resolveStop(0);

    const speechError = new Error('native speech failed');
    act(() => utterances[0].options.onError?.(speechError));

    expect(current().activeMessageId).toBeUndefined();
    expect(mockOnError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(expect.any(String), speechError);
    expect(stopRequests).toHaveLength(2);

    act(() => {
      utterances[0].options.onError?.(speechError);
      utterances[0].options.onDone?.();
    });
    expect(mockOnError).toHaveBeenCalledTimes(1);
    expect(utterances).toHaveLength(1);
  });

  it('keeps a user stop invalidated and reports its rejection once', async () => {
    await renderHook();
    readAloud('a');
    await resolveStop(0);

    act(() => current().stopReadAloud());

    expect(current().activeMessageId).toBeUndefined();
    const stopError = new Error('user stop failed');
    await rejectStop(1, stopError);

    expect(mockOnError).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).toHaveBeenCalledWith(expect.any(String), stopError);
    act(() => utterances[0].options.onDone?.());
    expect(utterances).toHaveLength(1);
  });

  it('stops only the matching active message through stopReadAloudIfActive', async () => {
    await renderHook();
    readAloud('a');
    await resolveStop(0);

    await expect(current().stopReadAloudIfActive('b')).resolves.toBeUndefined();
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(current().activeMessageId).toBe('a');

    let stopping!: Promise<void>;
    act(() => {
      stopping = current().stopReadAloudIfActive('a');
    });
    expect(current().activeMessageId).toBeUndefined();

    stopRequests[1].reject(new Error('matching stop failed'));
    await act(async () => stopping);
    expect(mockOnError).toHaveBeenCalledTimes(1);
  });

  it('does not stop global speech for idle app, focus, or unmount cleanup', async () => {
    await renderHook();

    act(() => appStateListener?.('background'));
    act(() => mockFocusCleanup?.());
    await act(async () => renderer?.unmount());
    renderer = undefined;

    expect(mockStop).not.toHaveBeenCalled();
  });

  it.each(['background', 'inactive'])(
    'system-cleans on %s without reporting cleanup failure',
    async (state) => {
      await renderHook();
      readAloud('a');
      await resolveStop(0);

      act(() => appStateListener?.(state));
      expect(current().activeMessageId).toBeUndefined();
      expect(stopRequests).toHaveLength(2);

      await rejectStop(1, new Error(`${state} cleanup failed`));
      expect(mockOnError).not.toHaveBeenCalled();
    },
  );

  it('system-cleans on focus loss without reporting cleanup failure', async () => {
    await renderHook();
    readAloud('a');
    await resolveStop(0);

    act(() => mockFocusCleanup?.());
    expect(current().activeMessageId).toBeUndefined();
    expect(stopRequests).toHaveLength(2);

    await rejectStop(1, new Error('focus cleanup failed'));
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('invalidates and stops on unmount without reporting cleanup failure', async () => {
    await renderHook();
    readAloud('a');
    await resolveStop(0);

    await act(async () => renderer?.unmount());
    renderer = undefined;

    expect(stopRequests).toHaveLength(2);
    await rejectStop(1, new Error('unmount cleanup failed'));
    expect(mockOnError).not.toHaveBeenCalled();
  });

  it('system-cleans when the topic changes', async () => {
    const hook = await renderHook();
    readAloud('a');
    await resolveStop(0);

    hook.rerender({ topicId: 'topic-b' });

    expect(current().activeMessageId).toBeUndefined();
    expect(stopRequests).toHaveLength(2);
  });

  it('keeps speaking when visible IDs append, then stops when the active ID disappears', async () => {
    const hook = await renderHook({ visibleMessageIds: ['a'] });
    readAloud('a');
    await resolveStop(0);

    hook.rerender({ visibleMessageIds: ['a', 'user-new', 'assistant-pending'] });

    expect(current().activeMessageId).toBe('a');
    expect(mockStop).toHaveBeenCalledTimes(1);

    hook.rerender({ visibleMessageIds: ['user-new', 'assistant-pending'] });

    expect(current().activeMessageId).toBeUndefined();
    expect(stopRequests).toHaveLength(2);
  });
});
