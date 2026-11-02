import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  VOICE_ENGINE_PREFERENCE,
  VOICE_ENGINES,
  VoiceError,
  type VoiceActivity,
  type VoiceCapability,
  type VoiceEngineId,
  type VoiceModule,
  type VoiceRequestOptions,
} from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import type { DictationEngine, SpeechEngine, TranscriptionEngine, VoiceEngines } from './engines';
import { speakableText } from './speechText';

export type VoiceRuntimeDependencies = {
  engines: VoiceEngines;
  preference: {
    get(key: (typeof VOICE_ENGINE_PREFERENCE)[VoiceCapability]): Promise<VoiceEngineId | null>;
  };
  /** Reading aloud and its voices follow the app language. */
  language(): AppLanguage;
  dictationLanguage(): AppLanguage;
  /** Subscribes to the app entering the background. */
  onBackground(listener: () => void): () => void;
};

type Activity = { activity: VoiceActivity; controller: AbortController };

const IDLE: VoiceActivity = { kind: 'idle' };

/**
 * Chooses live voice engines and owns the single dictation, speech or transcription activity.
 * Callers cancel file work; capture/playback also end on backgrounding. Engines own native resources.
 */
export function createVoiceRuntime({
  engines,
  preference,
  language,
  dictationLanguage,
  onBackground,
}: VoiceRuntimeDependencies): {
  module: Omit<VoiceModule, 'localModel'>;
  dispose(): Promise<void>;
} {
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
      update(next: VoiceActivity) {
        if (current !== owner || linked.signal.aborted) return;
        owner.activity = next;
        listeners.forEach((listener) => listener());
      },
      release() {
        linked.dispose();
        if (current !== owner) return;
        current = null;
        listeners.forEach((listener) => listener());
      },
    };
  }

  function registry(capability: VoiceCapability) {
    return engines[capability] as Partial<
      Record<VoiceEngineId, DictationEngine | SpeechEngine | TranscriptionEngine>
    >;
  }

  /** Dictation is opt-in; transcription defaults to SenseVoice; speech finds a supported engine. */
  async function effectiveEngine(capability: VoiceCapability, signal: AbortSignal) {
    const stored = await preference.get(VOICE_ENGINE_PREFERENCE[capability]);
    signal.throwIfAborted();
    const selected =
      VOICE_ENGINES.find((engine) => engine === stored) ??
      (capability === 'transcription' ? 'sensevoice' : undefined);
    if (capability === 'dictation' && !selected) return null;
    for (const id of selected ? [selected] : VOICE_ENGINES) {
      const status = (await registry(capability)[id]?.status(signal)) ?? 'unsupported';
      signal.throwIfAborted();
      if (status !== 'unsupported' || selected) return { id, status };
    }
    return null;
  }

  async function resolve<T extends DictationEngine | SpeechEngine | TranscriptionEngine>(
    capability: VoiceCapability,
    signal: AbortSignal,
  ): Promise<T> {
    const effective = await effectiveEngine(capability, signal);
    if (!effective && capability === 'dictation')
      throw new VoiceError('not-configured', 'Select a dictation engine first.');
    if (effective?.status === 'needs-setup')
      throw new VoiceError(
        capability === 'transcription'
          ? 'offline-recognition-unavailable'
          : 'recognition-not-configured',
        'Configure system speech recognition for the selected language first.',
      );
    if (effective?.status === 'needs-model')
      throw new VoiceError(
        'model-not-downloaded',
        'Download the offline voice model in voice settings.',
      );
    if (effective?.status === 'ready') return registry(capability)[effective.id] as T;
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

  const unsubscribeBackground = onBackground(() => {
    // File work has no capture/playback session. Its caller owns cancellation; an Agent turn
    // can keep working under the Host's existing background execution lease.
    if (current?.activity.kind !== 'transcribing') current?.controller.abort();
  });

  const module: Omit<VoiceModule, 'localModel'> = {
    getTranscriptionStatus: (options) =>
      run(
        options,
        async (signal) => (await effectiveEngine('transcription', signal))?.status ?? 'unsupported',
      ),
    async transcribeAudio(input, options) {
      if (current && current.activity.kind !== 'speaking')
        throw new VoiceError('busy', 'Another voice operation is running.');
      const transcribing: VoiceActivity = {
        kind: 'transcribing',
        fileEntryId: input.fileEntryId,
        ...(options?.key ? { key: options.key } : {}),
      };
      const activity = claim(transcribing, options?.signal);
      try {
        const transcription = await track(
          resolve<TranscriptionEngine>('transcription', activity.signal),
        );
        activity.signal.throwIfAborted();
        return await track(
          transcription.run(input, {
            ...options,
            signal: activity.signal,
            onProgress(progress) {
              activity.update({ ...transcribing, progress });
              options?.onProgress?.(progress);
            },
          }),
        );
      } finally {
        activity.release();
      }
    },
    getEngineStatus: (capability, engine, options) =>
      run(
        options,
        async (signal) => (await registry(capability)[engine]?.status(signal)) ?? 'unsupported',
      ),
    getEffectiveEngine: (capability, options) =>
      run(options, async (signal) => (await effectiveEngine(capability, signal))?.id ?? null),
    listVoices: (engine, options) =>
      run(options, async (signal) => {
        const speech = engines.speech[engine];
        if (!speech) throw new VoiceError('unsupported', `The ${engine} engine cannot speak.`);
        return speech.listVoices(language(), signal);
      }),

    async startDictation(options) {
      if (current && current.activity.kind !== 'speaking')
        throw new VoiceError('busy', 'Another voice operation is running.');
      const activity = claim({ kind: 'dictating' }, options?.signal);
      try {
        const engine = await track(resolve<DictationEngine>('dictation', activity.signal));
        const session = await track(
          engine.start({
            language: dictationLanguage(),
            signal: activity.signal,
            onText: (text) => options?.onText?.(text),
            onLevel: (level) => options?.onLevel?.(level),
            onTranscribing: () => options?.onTranscribing?.(),
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
      if (current && current.activity.kind !== 'speaking')
        throw new VoiceError('busy', 'Reading aloud cannot start during recognition.');
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
