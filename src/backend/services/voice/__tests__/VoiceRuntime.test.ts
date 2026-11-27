import {
  VoiceError,
  type AudioTranscriptionOptions,
  type AudioTranscriptionResult,
  type DictationSession,
  type VoiceEngineId,
  type VoiceEngineStatus,
} from '@/shared/contracts/voice';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import type { DictationEngine, SpeechEngine, TranscriptionEngine } from '../engines';
import { createVoiceRuntime, type VoiceRuntimeDependencies } from '../VoiceRuntime';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Speaks until stopped through its signal, like a native engine. */
function speechEngine(status: VoiceEngineStatus = 'ready') {
  const spoken: string[] = [];
  const engine: SpeechEngine = {
    status: jest.fn(async () => status),
    listVoices: jest.fn(async () => []),
    speak: jest.fn(
      ({ text, signal }) =>
        new Promise<void>((_resolve, reject) => {
          spoken.push(text);
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    ),
  };
  return { engine, spoken };
}

function dictationEngine(status: VoiceEngineStatus = 'ready') {
  const result = deferred<string>();
  const session: DictationSession = { result: result.promise, stop: jest.fn() };
  const engine: DictationEngine = {
    status: jest.fn(async () => status),
    start: jest.fn(async ({ signal }) => {
      signal.addEventListener('abort', () => result.reject(signal.reason));
      return session;
    }),
  };
  return { engine, result, session };
}

function setup({
  dictation = {},
  speech = {},
  selected = {},
  transcription,
  systemTranscription,
  cloudTranscription,
  canSpeakInBackground,
  isBackgrounded,
  beginBackgroundPlayback,
}: {
  transcription?: TranscriptionEngine;
  systemTranscription?: TranscriptionEngine;
  cloudTranscription?: TranscriptionEngine;
  dictation?: Partial<Record<VoiceEngineId, DictationEngine>>;
  speech?: Partial<Record<VoiceEngineId, SpeechEngine>>;
  selected?: Partial<Record<'dictation' | 'speech' | 'transcription', VoiceEngineId>>;
  canSpeakInBackground?: () => boolean;
  isBackgrounded?: () => boolean;
  beginBackgroundPlayback?: VoiceRuntimeDependencies['beginBackgroundPlayback'];
}) {
  let background: (() => void) | undefined;
  const runtime = createVoiceRuntime({
    engines: {
      dictation,
      speech,
      transcription: {
        sensevoice: transcription,
        system: systemTranscription,
        deepseek: cloudTranscription,
      },
    },
    preference: {
      get: async (key) =>
        (key === 'feature.voice.dictation_engine'
          ? selected.dictation
          : key === 'feature.voice.transcription_engine'
            ? selected.transcription
            : selected.speech) ?? null,
    },
    language: () => 'zh-CN',
    dictationLanguage: () => 'en-US',
    canSpeakInBackground,
    isBackgrounded,
    beginBackgroundPlayback,
    onBackground: (listener) => {
      background = listener;
      return () => {
        background = undefined;
      };
    },
  });
  return { ...runtime, background: () => background?.() };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('publishes transcription progress for its file and caller without reviving a cancelled task', async () => {
  const entered = deferred<NonNullable<AudioTranscriptionOptions['onProgress']>>();
  const native = deferred<AudioTranscriptionResult>();
  const runtime = setup({
    transcription: {
      status: async () => 'ready',
      run: async (_input, options) => {
        entered.resolve(options.onProgress!);
        return native.promise;
      },
    },
  });
  const controller = new AbortController();
  const fileEntryId = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001');
  const task = runtime.module.transcribeAudio(
    { fileEntryId },
    { signal: controller.signal, key: 'call-1' },
  );
  const report = await entered.promise;
  const initial = runtime.module.getActivity();
  report({ completedSeconds: 30, totalSeconds: 60 });
  expect(runtime.module.getActivity()).toEqual({
    kind: 'transcribing',
    fileEntryId,
    key: 'call-1',
    progress: { completedSeconds: 30, totalSeconds: 60 },
  });
  expect(initial).toEqual({ kind: 'transcribing', fileEntryId, key: 'call-1' });
  controller.abort();
  const cancelled = runtime.module.getActivity();
  report({ completedSeconds: 60, totalSeconds: 60 });
  expect(runtime.module.getActivity()).toBe(cancelled);
  native.reject(controller.signal.reason);
  await expect(task).rejects.toBe(controller.signal.reason);
  report({ completedSeconds: 60, totalSeconds: 60 });
  expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });
  await runtime.dispose();
});

describe('engine choice', () => {
  test('offline voice needs a downloaded model and never falls back to a network-capable system service', async () => {
    const local = dictationEngine('needs-model');
    const system = dictationEngine();
    const { module } = setup({
      dictation: { system: system.engine, sensevoice: local.engine },
      selected: { dictation: 'sensevoice' },
    });
    await expect(module.startDictation()).rejects.toMatchObject({ code: 'model-not-downloaded' });
    expect(system.engine.start).not.toHaveBeenCalled();
    expect(local.engine.start).not.toHaveBeenCalled();
  });
  test('a missing device default preserves the choice and reports actionable setup', async () => {
    const system = dictationEngine('needs-setup');
    const { module } = setup({
      dictation: { system: system.engine },
      selected: { dictation: 'system' },
    });
    await expect(module.getEffectiveEngine('dictation')).resolves.toBe('system');
    await expect(module.startDictation()).rejects.toMatchObject({
      code: 'recognition-not-configured',
    });
    expect(system.engine.start).not.toHaveBeenCalled();
    expect(module.getActivity()).toEqual({ kind: 'idle' });
  });

  test('dictation stays off until an engine is explicitly selected', async () => {
    const system = dictationEngine();
    const { module } = setup({ dictation: { system: system.engine } });
    await expect(module.getEffectiveEngine('dictation')).resolves.toBeNull();
    await expect(module.startDictation()).rejects.toMatchObject({ code: 'not-configured' });
    expect(system.engine.start).not.toHaveBeenCalled();
  });

  test('without a choice, speech uses the available system engine', async () => {
    const system = speechEngine();
    const { module } = setup({ speech: { system: system.engine } });
    await expect(module.getEffectiveEngine('speech')).resolves.toBe('system');
    const reading = module.speak('hello');
    await flush();
    expect(system.spoken).toEqual(['hello']);
    module.stopSpeaking();
    await reading;
  });

  test('an unavailable system engine reports unsupported and releases the activity', async () => {
    const system = speechEngine('unsupported');
    const { module } = setup({
      speech: { system: system.engine },
      selected: { speech: 'system' },
    });
    await expect(module.speak('hello')).rejects.toMatchObject({ code: 'unsupported' });
    expect(system.engine.speak).not.toHaveBeenCalled();
    expect(module.getActivity()).toEqual({ kind: 'idle' });
  });

  test('dictation uses its own language while reading follows the app', async () => {
    const dictation = dictationEngine();
    const speech = speechEngine();
    const { module } = setup({
      selected: { dictation: 'system' },
      dictation: { system: dictation.engine },
      speech: { system: speech.engine },
    });
    await module.startDictation();
    expect(dictation.engine.start).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'en-US' }),
    );
    dictation.result.resolve('done');
    await flush();
    void module.speak('hello');
    await flush();
    expect(speech.engine.speak).toHaveBeenCalledWith(
      expect.objectContaining({ language: 'zh-CN' }),
    );
  });
});

describe('one voice activity at a time', () => {
  test('reading aloud receives prose, and another message replaces it', async () => {
    const { engine, spoken } = speechEngine();
    const { module } = setup({ speech: { system: engine } });
    const first = module.speak('# Title\n\n```ts\nconst x = 1;\n```\n\n[Read](https://x.dev)', {
      key: 'a',
    });
    await flush();
    expect(spoken).toEqual(['Title\nRead']);
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'a', phase: 'preparing' });

    const second = module.speak('Next', { key: 'b' });
    await expect(first).resolves.toBeUndefined();
    await flush();
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'b', phase: 'preparing' });
    module.stopSpeaking({ key: 'a' });
    expect(jest.mocked(engine.speak).mock.calls[1][0].signal.aborted).toBe(false);
    module.stopSpeaking({ key: 'b' });
    await expect(second).resolves.toBeUndefined();
    expect(module.getActivity()).toEqual({ kind: 'idle' });
  });

  test('claims preparing immediately and publishes playing only once for the current reading without overriding pause', async () => {
    const { engine } = speechEngine();
    const { module } = setup({ speech: { system: engine } });
    const listener = jest.fn();
    const unsubscribe = module.subscribeActivity(listener);
    const first = module.speak('Start', { key: 'a' });
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'a', phase: 'preparing' });
    await flush();

    const firstRequest = jest.mocked(engine.speak).mock.calls[0][0];
    const second = module.speak('Replacement', { key: 'b' });
    firstRequest.playback?.onPhase('playing');
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'b', phase: 'preparing' });
    await first;
    await flush();
    const secondRequest = jest.mocked(engine.speak).mock.calls[1][0];
    secondRequest.playback?.onPhase('playing');
    secondRequest.playback?.onPhase('playing');
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'b', phase: 'playing' });
    expect(listener).toHaveBeenCalledTimes(3);

    module.pauseSpeaking();
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'b', phase: 'paused' });
    // Late native startup phase events must not override an active user or interruption pause.
    secondRequest.playback?.onPhase('playing');
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'b', phase: 'paused' });

    module.stopSpeaking({ key: 'b' });
    await second;
    expect(module.getActivity()).toEqual({ kind: 'idle' });
    unsubscribe();
  });

  test('reads preprocessed prose literally and leaves the activity alone for empty input', async () => {
    const { engine, spoken } = speechEngine();
    const { module } = setup({ speech: { system: engine } });
    const reading = module.speak('  [label](path) and https://code.test  ', {
      key: 'a',
      inputFormat: 'plainText',
    });
    await flush();
    expect(spoken).toEqual(['[label](path) and https://code.test']);
    const activity = module.getActivity();
    await module.speak('  ', { inputFormat: 'plainText', key: 'blank' });
    await module.speak('![image](https://example.test/image)', { key: 'silent' });
    expect(module.getActivity()).toBe(activity);
    module.stopSpeaking();
    await reading;
  });

  test('dictation stops reading, and reading cannot start while dictating', async () => {
    const speech = speechEngine();
    const dictation = dictationEngine();
    const { module } = setup({
      selected: { dictation: 'system' },
      speech: { system: speech.engine },
      dictation: { system: dictation.engine },
    });
    const reading = module.speak('hello');
    await flush();
    const session = await module.startDictation();
    await expect(reading).resolves.toBeUndefined();
    expect(module.getActivity()).toEqual({ kind: 'dictating' });
    await expect(module.speak('again')).rejects.toBeInstanceOf(VoiceError);
    await expect(module.startDictation()).rejects.toMatchObject({ code: 'busy' });

    dictation.result.resolve('你好');
    await expect(session.result).resolves.toBe('你好');
    await flush();
    expect(module.getActivity()).toEqual({ kind: 'idle' });
  });

  test('backgrounding ends dictation and discards its text', async () => {
    const dictation = dictationEngine();
    const runtime = setup({
      dictation: { system: dictation.engine },
      selected: { dictation: 'system' },
    });
    const session = await runtime.module.startDictation();
    runtime.background();
    await expect(session.result).rejects.toBeDefined();
    await flush();
    expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });
  });

  test('reading continues after background opt-in and stops when that policy no longer allows it', async () => {
    let allowed = true;
    const speech = speechEngine();
    const runtime = setup({
      speech: { system: speech.engine },
      canSpeakInBackground: () => allowed,
    });
    const reading = runtime.module.speak('hello');
    await flush();
    runtime.background();
    expect(runtime.module.getActivity().kind).toBe('speaking');
    allowed = false;
    runtime.background();
    await reading;
    expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });
    await runtime.dispose();
  });

  test('a pending media service can be cancelled mid-admission and its handlers control only that reading', async () => {
    const speech = speechEngine();
    const admitted = deferred<boolean>();
    const updateState = jest.fn(async () => {});
    const end = jest.fn(async () => {
      admitted.resolve(false);
    });
    let handlers:
      | {
          onPause(): void;
          onResume(): void;
          onInterrupt(): void;
          onInterruptionEnded(): void;
          onStop(): void;
        }
      | undefined;
    const runtime = setup({
      speech: { system: speech.engine },
      beginBackgroundPlayback: (_labels, nextHandlers) => {
        handlers = nextHandlers;
        return { admitted: admitted.promise, updateState, end };
      },
    });
    const labels = {
      title: 'Read aloud',
      subtitle: 'Cherry Studio',
      channelName: 'Read aloud',
      play: 'Resume',
      pause: 'Pause',
      stop: 'Stop',
    };
    const cancelledBeforeAdmit = runtime.module.speak('cancelled', { systemLabels: labels });
    await flush();
    runtime.module.stopSpeaking();
    await expect(cancelledBeforeAdmit).resolves.toBeUndefined();
    expect(end).toHaveBeenCalledTimes(1);
    expect(speech.spoken).toEqual([]);
    expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });

    const secondAdmitted = deferred<boolean>();
    const secondEnd = jest.fn(async () => {});
    const runtime2 = setup({
      speech: { system: speech.engine },
      beginBackgroundPlayback: (_labels, nextHandlers) => {
        handlers = nextHandlers;
        return { admitted: secondAdmitted.promise, updateState, end: secondEnd };
      },
    });
    const reading = runtime2.module.speak('first', { systemLabels: labels });
    await flush();
    // Backgrounding while native admission is still pending waits for the admission outcome.
    runtime2.background();
    expect(speech.spoken).toEqual([]);
    secondAdmitted.resolve(true);
    await flush();
    expect(speech.spoken).toEqual(['first']);
    handlers!.onStop();
    await reading;
    expect(secondEnd).toHaveBeenCalledTimes(1);

    const next = runtime2.module.speak('second');
    await flush();
    handlers!.onStop();
    expect(runtime2.module.getActivity().kind).toBe('speaking');
    runtime2.background();
    await next;
    await runtime.dispose();
    await runtime2.dispose();
  });

  test('continues in foreground if background admission is declined, and stops only on background', async () => {
    const speech = speechEngine();
    const end = jest.fn(async () => {});
    const runtime = setup({
      speech: { system: speech.engine },
      beginBackgroundPlayback: () => ({
        admitted: Promise.resolve(false),
        updateState: jest.fn(async () => {}),
        end,
      }),
    });
    const reading = runtime.module.speak('hello', {
      systemLabels: {
        title: 'Read aloud',
        subtitle: 'Cherry Studio',
        channelName: 'Read aloud',
        play: 'Resume',
        pause: 'Pause',
        stop: 'Stop',
      },
    });
    await flush();
    expect(speech.spoken).toEqual(['hello']);
    expect(runtime.module.getActivity().kind).toBe('speaking');
    runtime.background();
    await reading;
    expect(end).toHaveBeenCalledTimes(1);
    expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });
    await runtime.dispose();
  });

  test('publishes metadata, progress, pause/resume phases, and scopes stopSpeaking by key and source', async () => {
    const enginePause = jest.fn();
    const engineResume = jest.fn(() => 'playing' as const);
    const updateState = jest.fn(async () => {});
    const end = jest.fn(async () => {});
    let capturedCallbacks: Parameters<SpeechEngine['speak']>[0]['playback'] | undefined;
    let handlers:
      | {
          onPause(): void;
          onResume(): void;
          onInterrupt(): void;
          onInterruptionEnded(): void;
          onStop(): void;
        }
      | undefined;
    let finished = deferred<void>();
    const engine: SpeechEngine = {
      status: async () => 'ready',
      listVoices: async () => [],
      speak: jest.fn(({ playback, signal }) => {
        capturedCallbacks = playback;
        return new Promise<void>((resolve, reject) => {
          void finished.promise.then(resolve, reject);
          signal.addEventListener('abort', () => reject(signal.reason));
        });
      }),
    };
    const runtime = setup({
      speech: { system: engine },
      beginBackgroundPlayback: (_labels, nextHandlers) => {
        handlers = nextHandlers;
        return { admitted: Promise.resolve(true), updateState, end };
      },
    });

    const reading = runtime.module.speak('Hello world.', {
      key: 'msg-1',
      metadata: {
        title: 'Chat',
        subtitle: 'Cherry',
        source: { kind: 'local', sessionId: 'sess-1' },
      },
      systemLabels: {
        title: 'Read aloud',
        subtitle: 'Cherry Studio',
        channelName: 'Read aloud',
        play: 'Resume',
        pause: 'Pause',
        stop: 'Stop',
      },
    });
    expect(runtime.module.getActivity()).toEqual({
      kind: 'speaking',
      key: 'msg-1',
      phase: 'preparing',
      metadata: {
        title: 'Chat',
        subtitle: 'Cherry',
        source: { kind: 'local', sessionId: 'sess-1' },
      },
    });

    await flush();
    capturedCallbacks!.onControls({ pause: enginePause, resume: engineResume });
    capturedCallbacks!.onProgress({ completedChunks: 1, totalChunks: 3 });
    capturedCallbacks!.onPhase('playing');
    expect(runtime.module.getActivity()).toEqual({
      kind: 'speaking',
      key: 'msg-1',
      phase: 'playing',
      metadata: {
        title: 'Chat',
        subtitle: 'Cherry',
        source: { kind: 'local', sessionId: 'sess-1' },
      },
      progress: { completedChunks: 1, totalChunks: 3 },
    });
    expect(updateState).toHaveBeenCalledWith('playing');

    // Non-matching key or source must not stop the active reading.
    runtime.module.stopSpeaking({ key: 'msg-other' });
    runtime.module.stopSpeaking({ source: { kind: 'local', sessionId: 'sess-other' } });
    expect(runtime.module.getActivity().kind).toBe('speaking');

    runtime.module.togglePauseSpeaking();
    expect(enginePause).toHaveBeenCalledTimes(1);
    expect(runtime.module.getActivity()).toMatchObject({ phase: 'paused' });
    expect(updateState).toHaveBeenCalledWith('paused');

    handlers!.onResume();
    expect(engineResume).toHaveBeenCalledTimes(1);
    expect(runtime.module.getActivity()).toMatchObject({ phase: 'playing' });
    expect(updateState).toHaveBeenLastCalledWith('playing');

    finished.resolve();
    await reading;
    expect(end).toHaveBeenCalledTimes(1);
    expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });

    finished = deferred<void>();
    const desktopSource = { kind: 'desktop', connectionId: 'conn-1', sessionId: 'sess-1' } as const;
    const remote = runtime.module.speak('Remote', {
      key: 'msg-r',
      metadata: { source: desktopSource },
    });
    await flush();
    runtime.module.stopSpeaking({ source: { kind: 'local', sessionId: 'sess-1' } });
    expect(runtime.module.getActivity().kind).toBe('speaking');
    runtime.module.stopSpeaking({ source: desktopSource });
    await remote;
    expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });
    await runtime.dispose();
  });

  test('applies a pause requested during preparing as soon as engine controls register and allows replacement while paused', async () => {
    const enginePause = jest.fn();
    const first = deferred<void>();
    const second = speechEngine();
    let callbacks: Parameters<SpeechEngine['speak']>[0]['playback'];
    const customEngine: SpeechEngine = {
      status: async () => 'ready',
      listVoices: async () => [],
      speak: jest.fn(({ text, playback, signal }) => {
        if (text === 'first') {
          callbacks = playback;
          return new Promise<void>((resolve, reject) => {
            void first.promise.then(resolve, reject);
            signal.addEventListener('abort', () => reject(signal.reason));
          });
        }
        return second.engine.speak({ text, language: 'zh-CN', signal, playback });
      }),
    };
    const runtime = setup({ speech: { system: customEngine } });
    const reading1 = runtime.module.speak('first', { key: 'a' });
    runtime.module.pauseSpeaking();
    expect(runtime.module.getActivity()).toMatchObject({ kind: 'speaking', phase: 'paused' });
    await flush();
    callbacks!.onControls({ pause: enginePause, resume: jest.fn() });
    expect(enginePause).toHaveBeenCalledTimes(1);

    const reading2 = runtime.module.speak('second', { key: 'b' });
    await reading1;
    await flush();
    expect(runtime.module.getActivity()).toMatchObject({
      kind: 'speaking',
      key: 'b',
      phase: 'preparing',
    });
    runtime.module.stopSpeaking();
    await reading2;
    await runtime.dispose();
  });

  test('dictation waits for the replaced speech engine to finish native cleanup', async () => {
    const entered = deferred();
    const stopped = deferred();
    const speech = speechEngine();
    speech.engine.speak = jest.fn(
      ({ signal }) =>
        new Promise<void>((_resolve, reject) => {
          entered.resolve();
          signal.addEventListener('abort', () => {
            void stopped.promise.then(() => reject(signal.reason));
          });
        }),
    );
    const dictation = dictationEngine();
    const runtime = setup({
      speech: { system: speech.engine },
      dictation: { system: dictation.engine },
      selected: { dictation: 'system' },
    });
    const reading = runtime.module.speak('hello');
    await entered.promise;
    const starting = runtime.module.startDictation();
    await flush();
    expect(dictation.engine.start).not.toHaveBeenCalled();
    stopped.resolve();
    const session = await starting;
    await reading;
    dictation.result.resolve('done');
    await session.result;
    await runtime.dispose();
  });

  test('replacement awaits a single native cleanup promise before admitting the next session', async () => {
    const speech = speechEngine();
    const firstAdmit = deferred<boolean>();
    const firstEndGate = deferred<void>();
    const secondAdmit = deferred<boolean>();
    const calls: string[] = [];
    const firstEnd = jest.fn(async () => {
      calls.push('end-1-start');
      firstAdmit.resolve(false);
      await firstEndGate.promise;
      calls.push('end-1-done');
    });
    const secondEnd = jest.fn(async () => {
      calls.push('end-2');
    });
    let seq = 0;
    const runtime = setup({
      speech: { system: speech.engine },
      beginBackgroundPlayback: () => {
        seq += 1;
        if (seq === 1) {
          calls.push('begin-1');
          return {
            admitted: firstAdmit.promise,
            updateState: jest.fn(async () => {}),
            end: firstEnd,
          };
        }
        calls.push('begin-2');
        return {
          admitted: secondAdmit.promise,
          updateState: jest.fn(async () => {}),
          end: secondEnd,
        };
      },
    });
    const labels = {
      title: 'Read aloud',
      subtitle: 'Cherry Studio',
      channelName: 'Read aloud',
      play: 'Resume',
      pause: 'Pause',
      stop: 'Stop',
    };

    const reading1 = runtime.module.speak('first', { systemLabels: labels });
    await flush();
    expect(calls).toEqual(['begin-1']);

    const reading2 = runtime.module.speak('second', { systemLabels: labels });
    await flush();
    expect(firstEnd).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['begin-1', 'end-1-start']);

    firstEndGate.resolve();
    await reading1;
    await flush();
    expect(calls).toEqual(['begin-1', 'end-1-start', 'end-1-done', 'begin-2']);
    secondAdmit.resolve(true);
    await flush();
    expect(speech.spoken).toEqual(['second']);
    runtime.module.stopSpeaking();
    await reading2;
    expect(secondEnd).toHaveBeenCalledTimes(1);
    await runtime.dispose();
  });

  test('centralizes pause reason, gates resume on requestResume, and prevents late interruption resume after user pause', async () => {
    const enginePause = jest.fn();
    const engineResume = jest.fn(() => 'playing' as const);
    let focusGate = deferred<boolean>();
    let callbacks: Parameters<SpeechEngine['speak']>[0]['playback'] | undefined;
    let handlers:
      | {
          onPause(): void;
          onResume(): void;
          onInterrupt(): void;
          onInterruptionEnded(): void;
          onStop(): void;
        }
      | undefined;
    let finished = deferred<void>();
    const engine: SpeechEngine = {
      status: async () => 'ready',
      listVoices: async () => [],
      speak: jest.fn(({ playback, signal }) => {
        callbacks = playback;
        return new Promise<void>((resolve, reject) => {
          void finished.promise.then(resolve, reject);
          signal.addEventListener('abort', () => reject(signal.reason));
        });
      }),
    };
    const runtime = setup({
      speech: { system: engine },
      beginBackgroundPlayback: (_labels, nextHandlers) => {
        handlers = nextHandlers;
        return {
          admitted: Promise.resolve(true),
          requestResume: jest.fn(() => focusGate.promise),
          updateState: jest.fn(async () => {}),
          end: jest.fn(async () => {}),
        };
      },
    });

    const labels = {
      title: 'Read aloud',
      subtitle: 'Cherry Studio',
      channelName: 'Read aloud',
      play: 'Resume',
      pause: 'Pause',
      stop: 'Stop',
    };
    const reading = runtime.module.speak('hello', { systemLabels: labels });
    await flush();
    callbacks!.onControls({ pause: enginePause, resume: engineResume });
    callbacks!.onPhase('playing');

    // System interruption pauses playback; user pause during interruption blocks automatic resume.
    handlers!.onInterrupt();
    expect(runtime.module.getActivity()).toMatchObject({ phase: 'paused' });
    runtime.module.pauseSpeaking();
    handlers!.onInterruptionEnded();
    await flush();
    expect(engineResume).not.toHaveBeenCalled();

    // Denied focus on user resume keeps reading paused.
    runtime.module.resumeSpeaking();
    focusGate.resolve(false);
    await flush();
    expect(engineResume).not.toHaveBeenCalled();
    expect(runtime.module.getActivity()).toMatchObject({ phase: 'paused' });

    finished.resolve();
    await reading;

    // Interruption-only pause resumes automatically once focus is granted, unless invalidated in flight.
    finished = deferred<void>();
    focusGate = deferred<boolean>();
    const reading2 = runtime.module.speak('world', { systemLabels: labels });
    await flush();
    callbacks!.onControls({ pause: enginePause, resume: engineResume });
    callbacks!.onPhase('playing');
    callbacks!.onInterrupted?.();
    expect(runtime.module.getActivity()).toMatchObject({ phase: 'paused' });
    handlers!.onInterruptionEnded();
    focusGate.resolve(true);
    await flush();
    expect(engineResume).toHaveBeenCalledTimes(1);
    expect(runtime.module.getActivity()).toMatchObject({ phase: 'playing' });

    // A user pause arriving while requestResume is in flight invalidates the pending token.
    focusGate = deferred<boolean>();
    handlers!.onInterrupt();
    handlers!.onInterruptionEnded();
    runtime.module.pauseSpeaking();
    focusGate.resolve(true);
    await flush();
    expect(engineResume).toHaveBeenCalledTimes(1);
    expect(runtime.module.getActivity()).toMatchObject({ phase: 'paused' });

    finished.resolve();
    await reading2;
    await runtime.dispose();
  });

  test('revokeBackgroundPlayback strips media session without interrupting foreground speech and aborts only when backgrounded', async () => {
    let spokenRequest: Parameters<SpeechEngine['speak']>[0] | undefined;
    const speech = speechEngine();
    const baseSpeak = speech.engine.speak;
    speech.engine.speak = jest.fn((input) => {
      spokenRequest = input;
      return baseSpeak(input);
    });
    const end = jest.fn(async () => {});
    let backgrounded = false;
    const runtime = setup({
      speech: { system: speech.engine },
      isBackgrounded: () => backgrounded,
      beginBackgroundPlayback: () => ({
        admitted: Promise.resolve(true),
        updateState: jest.fn(async () => {}),
        end,
      }),
    });

    const reading = runtime.module.speak('hello', {
      systemLabels: {
        title: 'Read aloud',
        subtitle: 'Cherry Studio',
        channelName: 'Read aloud',
        play: 'Resume',
        pause: 'Pause',
        stop: 'Stop',
      },
    });
    await flush();
    expect(typeof spokenRequest?.backgroundPlayback).toBe('function');
    expect((spokenRequest?.backgroundPlayback as () => boolean)()).toBe(true);
    runtime.revokeBackgroundPlayback();
    expect(end).toHaveBeenCalledTimes(1);
    expect((spokenRequest?.backgroundPlayback as () => boolean)()).toBe(false);
    expect(runtime.module.getActivity().kind).toBe('speaking');

    runtime.background();
    await reading;
    expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });

    backgrounded = true;
    const reading2 = runtime.module.speak('world', {
      systemLabels: {
        title: 'Read aloud',
        subtitle: 'Cherry Studio',
        channelName: 'Read aloud',
        play: 'Resume',
        pause: 'Pause',
        stop: 'Stop',
      },
    });
    await flush();
    runtime.revokeBackgroundPlayback();
    await reading2;
    expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });
    await runtime.dispose();
  });

  test('disposal aborts the activity and waits for the engine to settle', async () => {
    const { engine } = speechEngine();
    const runtime = setup({ speech: { system: engine } });
    const listener = jest.fn();
    runtime.module.subscribeActivity(listener);
    const reading = runtime.module.speak('hello');
    await flush();
    await runtime.dispose();
    await expect(reading).resolves.toBeUndefined();
    await expect(runtime.module.speak('again')).rejects.toBeDefined();
    expect(listener).toHaveBeenCalled();
  });
});

test('file transcription holds the shared voice activity until native work drains on disposal', async () => {
  const entered = deferred<AbortSignal>();
  const native = deferred<never>();
  const transcription = {
    status: async () => 'ready' as const,
    run: async (_input: unknown, { signal }: { signal: AbortSignal }) => {
      entered.resolve(signal);
      return native.promise;
    },
  };
  const runtime = setup({ transcription });
  const fileEntryId = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001');
  const task = runtime.module.transcribeAudio({ fileEntryId });
  const signal = await entered.promise;
  expect(runtime.module.getActivity()).toEqual({ kind: 'transcribing', fileEntryId });
  await expect(runtime.module.startDictation()).rejects.toMatchObject({ code: 'busy' });
  await expect(runtime.module.transcribeAudio({ fileEntryId })).rejects.toMatchObject({
    code: 'busy',
  });
  await expect(runtime.module.speak('hello')).rejects.toMatchObject({ code: 'busy' });
  runtime.background();
  expect(signal.aborted).toBe(false);
  let disposed = false;
  const disposal = runtime.dispose().then(() => {
    disposed = true;
  });
  expect(signal.aborted).toBe(true);
  await Promise.resolve();
  expect(disposed).toBe(false);
  native.reject(signal.reason);
  await expect(task).rejects.toBe(signal.reason);
  await disposal;
  expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });
});

test('audio transcription defaults to SenseVoice even when system recognition is ready', async () => {
  const systemTranscription: TranscriptionEngine = {
    status: jest.fn(async () => 'ready'),
    run: jest.fn(),
  };
  const runtime = setup({
    transcription: { status: async () => 'needs-model', run: jest.fn() },
    systemTranscription,
  });
  await expect(runtime.module.getEffectiveEngine('transcription')).resolves.toBe('sensevoice');
  await expect(runtime.module.getTranscriptionStatus()).resolves.toBe('needs-model');
  await expect(runtime.module.getReadyTranscriptionEngine()).resolves.toBeNull();
  await expect(
    runtime.module.transcribeAudio({
      fileEntryId: FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001'),
    }),
  ).rejects.toMatchObject({ code: 'model-not-downloaded' });
  expect(systemTranscription.run).not.toHaveBeenCalled();
  await runtime.dispose();
});

test('rejects a tool prepared for local transcription after the engine changes to DeepSeek', async () => {
  const selected: { transcription: VoiceEngineId } = { transcription: 'sensevoice' };
  const upload = jest.fn();
  const runtime = setup({
    selected,
    transcription: { status: async () => 'ready', run: jest.fn() },
    cloudTranscription: { status: async () => 'ready', run: upload },
  });
  const expectedEngine = await runtime.module.getReadyTranscriptionEngine();
  expect(expectedEngine).toBe('sensevoice');
  selected.transcription = 'deepseek';

  await expect(
    runtime.module.transcribeAudio(
      { fileEntryId: FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001') },
      { expectedEngine: expectedEngine! },
    ),
  ).rejects.toThrow('transcription engine changed');
  expect(upload).not.toHaveBeenCalled();
  await runtime.dispose();
});

test('the selected system file engine reports offline setup without falling back to SenseVoice', async () => {
  const localRun = jest.fn();
  const runtime = setup({
    transcription: { status: async () => 'ready', run: localRun },
    systemTranscription: { status: async () => 'needs-setup', run: jest.fn() },
    selected: { transcription: 'system' },
  });
  await expect(runtime.module.getTranscriptionStatus()).resolves.toBe('needs-setup');
  await expect(
    runtime.module.transcribeAudio({
      fileEntryId: FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001'),
    }),
  ).rejects.toMatchObject({ code: 'offline-recognition-unavailable' });
  expect(localRun).not.toHaveBeenCalled();
  expect(runtime.module.getActivity()).toEqual({ kind: 'idle' });
  await runtime.dispose();
});

test('the chosen system engine runs without a downloaded SenseVoice model', async () => {
  const localRun = jest.fn();
  const systemRun = jest.fn(async () => {
    throw new VoiceError('no-speech', 'Silent file');
  });
  const runtime = setup({
    transcription: { status: async () => 'needs-model', run: localRun },
    systemTranscription: { status: async () => 'ready', run: systemRun },
    selected: { transcription: 'system' },
  });
  await expect(runtime.module.getTranscriptionStatus()).resolves.toBe('ready');
  await expect(
    runtime.module.transcribeAudio({
      fileEntryId: FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001'),
    }),
  ).rejects.toMatchObject({ code: 'no-speech' });
  expect(systemRun).toHaveBeenCalledTimes(1);
  expect(localRun).not.toHaveBeenCalled();
  await runtime.dispose();
});
