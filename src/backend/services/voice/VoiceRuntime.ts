import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import {
  isSameSpeechSource,
  VOICE_ENGINE_PREFERENCE,
  VOICE_ENGINES,
  VoiceError,
  type SpeakSystemLabels,
  type SpeechPhase,
  type SpeechProgress,
  type VoiceActivity,
  type VoiceCapability,
  type VoiceEngineId,
  type VoiceModule,
  type VoiceRequestOptions,
} from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';
import { speakableText } from '@/shared/utils/speechText';

import type {
  DictationEngine,
  SpeechEngine,
  SpeechPlaybackControls,
  TranscriptionEngine,
  VoiceEngines,
} from './engines';

export type BackgroundPlaybackHandlers = {
  onPause(): void;
  onResume(): void;
  onInterrupt(): void;
  onInterruptionEnded(): void;
  onStop(): void;
};

export type BackgroundPlaybackSession = {
  readonly admitted: Promise<boolean>;
  requestResume?(): Promise<boolean>;
  updateState(phase: SpeechPhase): Promise<void>;
  end(): Promise<void>;
};

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
  isBackgrounded?(): boolean;
  canSpeakInBackground?(): boolean;
  beginBackgroundPlayback?(
    labels: SpeakSystemLabels,
    handlers: BackgroundPlaybackHandlers,
  ): BackgroundPlaybackSession | undefined;
};

type SpeakingActivity = Extract<VoiceActivity, { kind: 'speaking' }>;
type PauseReason = 'none' | 'user' | 'interruption';

type Activity = {
  activity: VoiceActivity;
  controller: AbortController;
  backgroundPlayback?: boolean;
  admissionSettled?: boolean;
  backgroundedDuringAdmission?: boolean;
  backgroundRevoked?: boolean;
  controls?: SpeechPlaybackControls | null;
  pauseReason?: PauseReason;
  resumeToken?: number;
  playbackSession?: BackgroundPlaybackSession;
  playbackSessionEnd?: Promise<void>;
  isAborted?: () => boolean;
  settled: Promise<void>;
};

const IDLE: VoiceActivity = { kind: 'idle' };

/**
 * Chooses live voice engines and owns the single dictation, speech or transcription activity.
 * Callers cancel file work; capture ends on backgrounding. Speech can continue after opt-in.
 */
export function createVoiceRuntime({
  engines,
  preference,
  language,
  dictationLanguage,
  onBackground,
  isBackgrounded = () => false,
  canSpeakInBackground = () => false,
  beginBackgroundPlayback,
}: VoiceRuntimeDependencies): {
  module: Omit<VoiceModule, 'localModel'>;
  revokeBackgroundPlayback(): void;
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
    const previous = current;
    previous?.controller.abort();
    const controller = new AbortController();
    const linked = linkAbortSignals(
      signal ? [lifetime.signal, controller.signal, signal] : [lifetime.signal, controller.signal],
    );
    let finish!: () => void;
    const settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const owner: Activity = {
      activity,
      controller,
      isAborted: () => linked.signal.aborted,
      settled,
    };
    current = owner;
    listeners.forEach((listener) => listener());
    return {
      owner,
      signal: linked.signal,
      // A replacement waits for native stop/cleanup before it changes the audio session.
      ready: previous?.settled ?? Promise.resolve(),
      update(next: VoiceActivity) {
        if (current !== owner || linked.signal.aborted) return;
        owner.activity = next;
        listeners.forEach((listener) => listener());
      },
      release() {
        linked.dispose();
        finish();
        if (current !== owner) return;
        current = null;
        listeners.forEach((listener) => listener());
      },
    };
  }

  function endPlaybackSession(owner: Activity) {
    if (!owner.playbackSession) return Promise.resolve();
    owner.playbackSessionEnd ??= owner.playbackSession.end().catch(() => {});
    return owner.playbackSessionEnd;
  }

  function syncSpeakingState(
    owner: Activity,
    patch: Partial<Pick<SpeakingActivity, 'phase' | 'progress'>>,
  ) {
    if (current !== owner || owner.isAborted?.() || owner.activity.kind !== 'speaking') return;
    const previousPhase = owner.activity.phase;
    const phaseChanged = patch.phase !== undefined && patch.phase !== previousPhase;
    const progressChanged =
      patch.progress !== undefined &&
      (patch.progress.completedChunks !== owner.activity.progress?.completedChunks ||
        patch.progress.totalChunks !== owner.activity.progress?.totalChunks);
    if (!phaseChanged && !progressChanged) return;
    owner.activity = {
      ...owner.activity,
      ...patch,
    };
    listeners.forEach((listener) => listener());
    if (phaseChanged && patch.phase && owner.playbackSession && !owner.backgroundRevoked) {
      void owner.playbackSession.updateState(patch.phase).catch(() => {});
    }
  }

  function pauseOwner(owner: Activity | null, reason: Exclude<PauseReason, 'none'>) {
    if (!owner || current !== owner || owner.isAborted?.() || owner.activity.kind !== 'speaking') {
      return;
    }
    owner.resumeToken = (owner.resumeToken ?? 0) + 1;
    if (owner.activity.phase === 'paused') {
      if (reason === 'user') owner.pauseReason = 'user';
      return;
    }
    owner.pauseReason = reason;
    syncSpeakingState(owner, { phase: 'paused' });
    owner.controls?.pause();
  }

  function applyResume(owner: Activity) {
    if (!owner || current !== owner || owner.isAborted?.() || owner.activity.kind !== 'speaking') {
      return;
    }
    if (owner.activity.phase !== 'paused') return;
    owner.pauseReason = 'none';
    if (owner.controls) {
      const nextPhase = owner.controls.resume() ?? 'playing';
      syncSpeakingState(owner, { phase: nextPhase });
    } else {
      syncSpeakingState(owner, { phase: 'preparing' });
    }
  }

  function resumeOwner(owner: Activity | null, trigger: Exclude<PauseReason, 'none'>) {
    if (!owner || current !== owner || owner.isAborted?.() || owner.activity.kind !== 'speaking') {
      return;
    }
    if (owner.activity.phase !== 'paused') return;
    if (trigger === 'interruption' && owner.pauseReason !== 'interruption') return;

    const session = owner.backgroundPlayback ? owner.playbackSession : undefined;
    if (session?.requestResume) {
      const token = (owner.resumeToken = (owner.resumeToken ?? 0) + 1);
      void track(
        session
          .requestResume()
          .catch(() => false)
          .then((granted) => {
            if (!granted || owner.resumeToken !== token) return;
            if (trigger === 'interruption' && owner.pauseReason !== 'interruption') return;
            applyResume(owner);
          }),
      );
      return;
    }
    applyResume(owner);
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
    for (const id of selected ? [selected] : VOICE_ENGINES.filter((id) => id !== 'deepseek')) {
      const status = (await registry(capability)[id]?.status(signal)) ?? 'unsupported';
      signal.throwIfAborted();
      if (status !== 'unsupported' || selected) return { id, status };
    }
    return null;
  }

  async function resolve<T extends DictationEngine | SpeechEngine | TranscriptionEngine>(
    capability: VoiceCapability,
    signal: AbortSignal,
    expectedEngine?: VoiceEngineId,
  ): Promise<T> {
    const effective = await effectiveEngine(capability, signal);
    if (expectedEngine && effective?.id !== expectedEngine)
      throw new VoiceError(
        'failed',
        'The transcription engine changed. Start a new turn to retry.',
      );
    if (!effective && capability === 'dictation')
      throw new VoiceError('not-configured', 'Select a dictation engine first.');
    if (effective?.status === 'needs-service')
      throw new VoiceError(
        'service-not-configured',
        'Configure the selected DeepSeek service first.',
      );
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
    if (current?.activity.kind === 'speaking') {
      if (current.backgroundPlayback) return;
      if (current.playbackSession && !current.admissionSettled && !current.backgroundRevoked) {
        current.backgroundedDuringAdmission = true;
        return;
      }
      if (!current.playbackSession && canSpeakInBackground()) return;
    }
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
    getReadyTranscriptionEngine: (options) =>
      run(options, async (signal) => {
        const engine = await effectiveEngine('transcription', signal);
        return engine?.status === 'ready' ? engine.id : null;
      }),
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
        await activity.ready;
        activity.signal.throwIfAborted();
        const transcription = await track(
          resolve<TranscriptionEngine>('transcription', activity.signal, options?.expectedEngine),
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
        await activity.ready;
        activity.signal.throwIfAborted();
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
      const prose = options?.inputFormat === 'plainText' ? text.trim() : speakableText(text);
      if (!prose) return;
      if (current && current.activity.kind !== 'speaking')
        throw new VoiceError('busy', 'Reading aloud cannot start during recognition.');
      const activity = claim(
        {
          kind: 'speaking',
          key: options?.key ?? null,
          phase: 'preparing',
          ...(options?.metadata ? { metadata: options.metadata } : {}),
        },
        options?.signal,
      );
      try {
        await activity.ready;
        activity.signal.throwIfAborted();
        if (beginBackgroundPlayback && options?.systemLabels) {
          const session = beginBackgroundPlayback(options.systemLabels, {
            onPause: () => pauseOwner(activity.owner, 'user'),
            onResume: () => resumeOwner(activity.owner, 'user'),
            onInterrupt: () => pauseOwner(activity.owner, 'interruption'),
            onInterruptionEnded: () => resumeOwner(activity.owner, 'interruption'),
            onStop: () => activity.owner.controller.abort(),
          });
          if (session) {
            activity.owner.playbackSession = session;
            const cancelPendingAdmission = () => {
              void endPlaybackSession(activity.owner);
            };
            activity.signal.addEventListener('abort', cancelPendingAdmission, { once: true });
            try {
              const admitted = (await track(session.admitted)) && !activity.owner.backgroundRevoked;
              activity.owner.admissionSettled = true;
              activity.owner.backgroundPlayback = admitted;
              if (
                !admitted &&
                activity.owner.backgroundedDuringAdmission &&
                !canSpeakInBackground()
              ) {
                activity.owner.controller.abort();
              }
            } finally {
              activity.signal.removeEventListener('abort', cancelPendingAdmission);
            }
            activity.signal.throwIfAborted();
            if (
              current === activity.owner &&
              activity.owner.backgroundPlayback &&
              activity.owner.activity.kind === 'speaking' &&
              activity.owner.activity.phase !== 'preparing'
            ) {
              void session.updateState(activity.owner.activity.phase).catch(() => {});
            }
          }
        }
        const engine = await track(resolve<SpeechEngine>('speech', activity.signal));
        await track(
          engine.speak({
            text: prose,
            language: language(),
            signal: activity.signal,
            backgroundPlayback: () =>
              Boolean(activity.owner.backgroundPlayback && !activity.owner.backgroundRevoked),
            playback: {
              onPhase(phase) {
                // Late native startup callbacks must not override an active user/interruption pause.
                if (
                  phase !== 'paused' &&
                  activity.owner.pauseReason &&
                  activity.owner.pauseReason !== 'none'
                ) {
                  return;
                }
                syncSpeakingState(activity.owner, { phase });
              },
              onProgress(progress: SpeechProgress) {
                syncSpeakingState(activity.owner, { progress });
              },
              onControls(controls) {
                if (current !== activity.owner || activity.signal.aborted) return;
                activity.owner.controls = controls;
                if (
                  controls &&
                  activity.owner.activity.kind === 'speaking' &&
                  activity.owner.activity.phase === 'paused'
                ) {
                  controls.pause();
                }
              },
              onInterrupted() {
                pauseOwner(activity.owner, 'interruption');
              },
            },
          }),
        );
      } catch (error) {
        // Stopping, replacement and caller cancellation all end reading normally.
        if (!activity.signal.aborted) throw error;
      } finally {
        activity.owner.controls = null;
        try {
          await endPlaybackSession(activity.owner);
        } finally {
          activity.release();
        }
      }
    },

    pauseSpeaking() {
      pauseOwner(current, 'user');
    },
    resumeSpeaking() {
      resumeOwner(current, 'user');
    },
    togglePauseSpeaking() {
      if (current?.activity.kind !== 'speaking') return;
      if (current.activity.phase === 'paused') resumeOwner(current, 'user');
      else if (current.activity.phase === 'playing') pauseOwner(current, 'user');
    },
    stopSpeaking(match) {
      if (current?.activity.kind !== 'speaking') return;
      if (match?.key !== undefined && current.activity.key !== match.key) return;
      if (
        match?.source !== undefined &&
        !isSameSpeechSource(current.activity.metadata?.source, match.source)
      ) {
        return;
      }
      current.controller.abort();
    },
    getActivity: () => current?.activity ?? IDLE,
    subscribeActivity(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  function revokeBackgroundPlayback() {
    const owner = current;
    if (!owner || owner.activity.kind !== 'speaking') return;
    if (!owner.backgroundPlayback && !owner.playbackSession) return;
    owner.backgroundRevoked = true;
    owner.backgroundPlayback = false;
    void endPlaybackSession(owner);
    if (isBackgrounded()) {
      owner.controller.abort();
    }
  }

  return {
    module,
    revokeBackgroundPlayback,
    dispose() {
      disposal ??= (async () => {
        unsubscribeBackground();
        lifetime.abort();
        await Promise.allSettled([...pending, current?.settled]);
        listeners.clear();
      })();
      return disposal;
    },
  };
}
