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
import { createVoiceRuntime } from '../VoiceRuntime';

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
}: {
  transcription?: TranscriptionEngine;
  systemTranscription?: TranscriptionEngine;
  dictation?: Partial<Record<VoiceEngineId, DictationEngine>>;
  speech?: Partial<Record<VoiceEngineId, SpeechEngine>>;
  selected?: Partial<Record<'dictation' | 'speech' | 'transcription', VoiceEngineId>>;
}) {
  let background: (() => void) | undefined;
  const runtime = createVoiceRuntime({
    engines: {
      dictation,
      speech,
      transcription: { sensevoice: transcription, system: systemTranscription },
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
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'a' });

    const second = module.speak('Next', { key: 'b' });
    await expect(first).resolves.toBeUndefined();
    await flush();
    expect(module.getActivity()).toEqual({ kind: 'speaking', key: 'b' });
    module.stopSpeaking();
    await expect(second).resolves.toBeUndefined();
    expect(module.getActivity()).toEqual({ kind: 'idle' });
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
  await expect(
    runtime.module.transcribeAudio({
      fileEntryId: FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001'),
    }),
  ).rejects.toMatchObject({ code: 'model-not-downloaded' });
  expect(systemTranscription.run).not.toHaveBeenCalled();
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
