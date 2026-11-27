import { AppState, Platform } from 'react-native';

import { fileContent } from '@/backend/services/file/fileContent';
import type { NetworkRegion } from '@/backend/services/region';
import type {
  VOICE_ENGINE_PREFERENCE,
  VoiceCapability,
  VoiceEngineId,
  VoiceEngineStatus,
  AudioTranscriptionOptions,
} from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import { getVoiceInput } from '../../../../modules/voice-input';
import { voiceAudioSession } from './audioSession';
import { createDeepseekDictation, createDeepseekTranscription } from './deepseekRecognition';
import { createDeepseekSpeech } from './deepseekSpeech';
import type { DictationEngine, TranscriptionEngine } from './engines';
import type { SystemPromptQueue } from './microphoneAccess';
import { createSenseVoiceDictationEngine } from './senseVoiceDictation';
import { createSenseVoiceTranscription } from './senseVoiceTranscription';
import { createSystemDictationEngine } from './systemDictation';
import { createSystemSpeechEngine } from './systemSpeech';
import { createSystemTranscription } from './systemTranscription';
import { transcribeAudioFile } from './transcribeAudioFile';
import { createVoiceModel } from './voiceModel';
import { createVoiceRuntime } from './VoiceRuntime';

type VoicePreferences = {
  get(key: (typeof VOICE_ENGINE_PREFERENCE)[VoiceCapability]): Promise<VoiceEngineId | null>;
  get(key: 'feature.voice.system_voice' | 'feature.voice.deepseek_voice'): Promise<string>;
  readCached(key: 'feature.voice.background_reading'): boolean;
  subscribeChange?(key: 'feature.voice.background_reading'): (listener: () => void) => () => void;
};

/**
 * Assembles the host's voice module: the only place that knows which native libraries stand
 * behind each engine. Adding an engine is an adapter plus one entry here.
 */
export function createVoice({
  preference,
  permissions,
  language,
  dictationLanguage,
  transcriptionLanguage,
  getRegion,
}: {
  preference: VoicePreferences;
  permissions: SystemPromptQueue;
  language(): AppLanguage;
  dictationLanguage(): AppLanguage;
  transcriptionLanguage(): AppLanguage;
  getRegion(): Promise<NetworkRegion>;
}) {
  const model = createVoiceModel(getRegion);
  const isBackgroundReadingAllowed = () =>
    preference.readCached('feature.voice.background_reading');

  const bindTranscription = (engine: {
    status(signal: AbortSignal): Promise<VoiceEngineStatus>;
    transcribe(
      uri: string,
      options: AudioTranscriptionOptions & { signal: AbortSignal },
    ): Promise<{ text: string; durationSeconds: number }>;
  }): TranscriptionEngine => ({
    status: engine.status,
    run: (input, options) => transcribeAudioFile(fileContent, engine.transcribe, input, options),
  });
  const bindDictation = (engine: DictationEngine): DictationEngine => ({
    status: engine.status,
    async start(input) {
      const release = await voiceAudioSession.acquire('capture');
      try {
        input.signal.throwIfAborted();
        const session = await engine.start(input);
        return { ...session, result: session.result.finally(release) };
      } catch (error) {
        await release();
        throw error;
      }
    },
  });
  const runtime = createVoiceRuntime({
    engines: {
      transcription: {
        deepseek: bindTranscription(createDeepseekTranscription()),
        sensevoice: bindTranscription(createSenseVoiceTranscription(model)),
        system: bindTranscription(
          createSystemTranscription({ permissions, language: transcriptionLanguage }),
        ),
      },
      dictation: {
        deepseek: bindDictation(createDeepseekDictation(permissions)),
        system: bindDictation(createSystemDictationEngine({ permissions })),
        sensevoice: bindDictation(createSenseVoiceDictationEngine(model, permissions)),
      },
      speech: {
        deepseek: createDeepseekSpeech(() => preference.get('feature.voice.deepseek_voice')),
        system: createSystemSpeechEngine({
          voice: () => preference.get('feature.voice.system_voice'),
        }),
      },
    },
    preference,
    language,
    dictationLanguage,
    canSpeakInBackground: () => Platform.OS === 'ios' && isBackgroundReadingAllowed(),
    isBackgrounded: () => AppState.currentState === 'background',
    beginBackgroundPlayback(labels, handlers) {
      if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !isBackgroundReadingAllowed()) {
        return undefined;
      }
      const native = getVoiceInput();
      if (!native?.beginPlayback || !native.endPlayback) return undefined;
      const endPlayback = native.endPlayback.bind(native);
      const requestPlaybackFocus = native.requestPlaybackFocus?.bind(native);
      const updatePlaybackState = native.updatePlaybackState?.bind(native);
      const id = globalThis.crypto.randomUUID();
      let isAdmitted = false;
      let isEnded = false;
      let endPromise: Promise<void> | undefined;

      const commandSubscription = native.addListener('playbackCommand', (event) => {
        if (event.id !== id || isEnded) return;
        if (event.action === 'pause') handlers.onPause();
        else if (event.action === 'resume') handlers.onResume();
        else if (event.action === 'interrupt') handlers.onInterrupt();
        else if (event.action === 'resume-interruption') handlers.onInterruptionEnded();
        else if (event.action === 'stop') handlers.onStop();
      });

      const end = () => {
        endPromise ??= (async () => {
          isEnded = true;
          commandSubscription.remove();
          try {
            if (Platform.OS === 'android' && isAdmitted) {
              await voiceAudioSession.playback(false).catch(() => {});
            }
          } finally {
            await endPlayback(id).catch(() => {});
          }
        })();
        return endPromise;
      };

      const admitted = native
        .beginPlayback({
          id,
          title: labels.title,
          subtitle: labels.subtitle,
          channelName: labels.channelName,
          playLabel: labels.play,
          pauseLabel: labels.pause,
          stopLabel: labels.stop,
          deepLinkUrl: labels.deepLinkUrl,
        })
        .then(
          () => {
            if (isEnded) return false;
            isAdmitted = true;
            return true;
          },
          () => {
            commandSubscription.remove();
            return false;
          },
        );

      return {
        admitted,
        ...(Platform.OS === 'android' && requestPlaybackFocus
          ? {
              async requestResume() {
                if (isEnded || !isAdmitted) return true;
                return (await requestPlaybackFocus(id).catch(() => false)) === true;
              },
            }
          : {}),
        async updateState(phase) {
          if (isEnded || !isAdmitted) return;
          await updatePlaybackState?.(id, phase);
        },
        end,
      };
    },
    onBackground(listener) {
      const subscription = AppState.addEventListener('change', (state) => {
        // A permission dialog the voice action itself opened is not leaving the app.
        if (state === 'background' && !permissions.isPresentingSystemPrompt()) listener();
      });
      return () => subscription.remove();
    },
  });

  const unsubscribePreference = preference.subscribeChange?.('feature.voice.background_reading')(
    () => {
      if (!isBackgroundReadingAllowed()) runtime.revokeBackgroundPlayback();
    },
  );

  return {
    module: { ...runtime.module, localModel: model.module },
    async dispose() {
      unsubscribePreference?.();
      // Stop admission/downloads immediately; runtime joins native recognition before disposal ends.
      await Promise.all([runtime.dispose(), model.dispose()]);
    },
  };
}
