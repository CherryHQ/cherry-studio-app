import {
  VoiceError,
  type DictationSession,
  type VoiceEngineId,
  type VoiceEngineStatus,
} from '@/shared/contracts/voice';

import type { DictationEngine, SpeechEngine } from '../engines';
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
}: {
  dictation?: Partial<Record<VoiceEngineId, DictationEngine>>;
  speech?: Partial<Record<VoiceEngineId, SpeechEngine>>;
  selected?: Partial<Record<'dictation' | 'speech', VoiceEngineId>>;
}) {
  let background: (() => void) | undefined;
  const runtime = createVoiceRuntime({
    engines: { dictation, speech },
    preference: {
      get: async (key) =>
        (key === 'feature.voice.dictation_engine' ? selected.dictation : selected.speech) ?? null,
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

describe('engine choice', () => {
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
