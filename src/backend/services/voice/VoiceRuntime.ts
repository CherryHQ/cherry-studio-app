import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  VOICE_ENGINE_PREFERENCE,
  VOICE_ENGINES,
  VoiceError,
  type VoiceActivity,
  type VoiceCapability,
  type VoiceEngineId,
  type VoiceModule,
  type VoiceProviderOption,
  type VoiceRequestOptions,
} from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import type { DictationEngine, SpeechEngine, VoiceEngines } from './engines';
import { speakableText } from './speechText';

export type VoiceRuntimeDependencies = {
  engines: VoiceEngines;
  preference: {
    get(key: (typeof VOICE_ENGINE_PREFERENCE)[VoiceCapability]): Promise<VoiceEngineId | null>;
  };
  listProviders(signal: AbortSignal): Promise<VoiceProviderOption[]>;
  /** Reading aloud and its voices follow the app language. */
  language(): AppLanguage;
  dictationLanguage(): AppLanguage;
  /** Subscribes to the app entering the background. */
  onBackground(listener: () => void): () => void;
};

type Activity = { activity: VoiceActivity; controller: AbortController };

const IDLE: VoiceActivity = { kind: 'idle' };

/**
 * The only place that chooses an engine. It owns the one active dictation or speech, its
 * cancellation on replacement, backgrounding and disposal; engines own their native resources.
 */
export function createVoiceRuntime({
  engines,
  preference,
  listProviders,
  language,
  dictationLanguage,
  onBackground,
}: VoiceRuntimeDependencies): { module: VoiceModule; dispose(): Promise<void> } {
  const lifetime = new AbortController();
  const pending = new Set<Promise<unknown>>();
  const listeners = new Set<() => void>();
  let current: Activity | null = null;
  let disposal: Promise<void> | undefined;

  function track<T>(work: Promise<T>): Promise<T> {
    pending.add(work);
    void work.then(
      () => pending.delete(work),
      () => pending.delete(work),
    );
    return work;
  }

  function claim(activity: VoiceActivity, signal?: AbortSignal) {
    lifetime.signal.throwIfAborted();
    current?.controller.abort();
    const controller = new AbortController();
    const linked = linkAbortSignals(
      signal ? [lifetime.signal, controller.signal, signal] : [lifetime.signal, controller.signal],
    );
    const owner: Activity = { activity, controller };
    current = owner;
    listeners.forEach((listener) => listener());
    return {
      signal: linked.signal,
      release() {
        linked.dispose();
        if (current !== owner) return;
        current = null;
        listeners.forEach((listener) => listener());
      },
    };
  }

  function registry(capability: VoiceCapability) {
    return (capability === 'dictation' ? engines.dictation : engines.speech) as Partial<
      Record<VoiceEngineId, DictationEngine | SpeechEngine>
    >;
  }

  /** An explicit choice is used as is; with none, the first engine this device supports. */
  async function effectiveEngine(capability: VoiceCapability, signal: AbortSignal) {
    const selected = await preference.get(VOICE_ENGINE_PREFERENCE[capability]);
    signal.throwIfAborted();
    for (const id of selected ? [selected] : VOICE_ENGINES) {
      const status = (await registry(capability)[id]?.status(signal)) ?? 'unsupported';
      signal.throwIfAborted();
      if (status !== 'unsupported' || selected) return { id, status };
    }
    return null;
  }

  async function resolve<T extends DictationEngine | SpeechEngine>(
    capability: VoiceCapability,
    signal: AbortSignal,
  ): Promise<T> {
    const effective = await effectiveEngine(capability, signal);
    if (effective?.status === 'ready') return registry(capability)[effective.id] as T;
    if (effective?.status === 'needs-setup')
      throw new VoiceError(
        'not-configured',
        `The ${effective.id} ${capability} engine needs setup.`,
      );
    throw new VoiceError('unsupported', `No ${capability} engine is available on this device.`);
  }

  async function run<T>(
    options: VoiceRequestOptions | undefined,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    lifetime.signal.throwIfAborted();
    const linked = linkAbortSignals(
      options?.signal ? [lifetime.signal, options.signal] : [lifetime.signal],
    );
    try {
      return await track(operation(linked.signal));
    } finally {
      linked.dispose();
    }
  }

  const unsubscribeBackground = onBackground(() => current?.controller.abort());

  const module: VoiceModule = {
    getEngineStatus: (capability, engine, options) =>
      run(
        options,
        async (signal) => (await registry(capability)[engine]?.status(signal)) ?? 'unsupported',
      ),
    getEffectiveEngine: (capability, options) =>
      run(options, async (signal) => (await effectiveEngine(capability, signal))?.id ?? null),
    listProviders: (options) => run(options, listProviders),
    listVoices: (engine, options) =>
      run(options, async (signal) => {
        const speech = engines.speech[engine];
        if (!speech) throw new VoiceError('unsupported', `The ${engine} engine cannot speak.`);
        return speech.listVoices(language(), signal);
      }),

    async startDictation(options) {
      if (current?.activity.kind === 'dictating')
        throw new VoiceError('busy', 'Dictation is already running.');
      const activity = claim({ kind: 'dictating' }, options?.signal);
      try {
        const engine = await track(resolve<DictationEngine>('dictation', activity.signal));
        const session = await track(
          engine.start({
            language: dictationLanguage(),
            signal: activity.signal,
            onText: (text) => options?.onText?.(text),
            onLevel: (level) => options?.onLevel?.(level),
          }),
        );
        const result = track(session.result);
        void result.then(activity.release, activity.release);
        return { result, stop: () => session.stop() };
      } catch (error) {
        activity.release();
        throw error;
      }
    },

    async speak(text, options) {
      if (current?.activity.kind === 'dictating')
        throw new VoiceError('busy', 'Reading aloud cannot start during dictation.');
      const prose = speakableText(text);
      if (!prose) return;
      const activity = claim({ kind: 'speaking', key: options?.key ?? null }, options?.signal);
      try {
        const engine = await track(resolve<SpeechEngine>('speech', activity.signal));
        await track(engine.speak({ text: prose, language: language(), signal: activity.signal }));
      } catch (error) {
        // Stopping, replacement, backgrounding and caller cancellation all end reading normally.
        if (!activity.signal.aborted) throw error;
      } finally {
        activity.release();
      }
    },

    stopSpeaking() {
      if (current?.activity.kind === 'speaking') current.controller.abort();
    },
    getActivity: () => current?.activity ?? IDLE,
    subscribeActivity(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    module,
    dispose() {
      disposal ??= (async () => {
        unsubscribeBackground();
        lifetime.abort();
        await Promise.allSettled([...pending]);
        listeners.clear();
      })();
      return disposal;
    },
  };
}
