import { AppState, Platform } from 'react-native';

import { fileContent } from '@/backend/services/file/fileContent';
import type {
  VOICE_ENGINE_PREFERENCE,
  VoiceCapability,
  VoiceEngineId,
} from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import { voiceAudioSession } from './audioSession';
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
  get(key: 'feature.voice.system_voice'): Promise<string>;
  readCached(key: 'app.background_audio.consent'): boolean | null;
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
  getCountry,
}: {
  preference: VoicePreferences;
  permissions: SystemPromptQueue;
  language(): AppLanguage;
  dictationLanguage(): AppLanguage;
  transcriptionLanguage(): AppLanguage;
  getCountry(): Promise<string>;
}) {
  const model = createVoiceModel(getCountry);
  const bindTranscription = (
    engine: ReturnType<typeof createSenseVoiceTranscription>,
  ): TranscriptionEngine => ({
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
        sensevoice: bindTranscription(createSenseVoiceTranscription(model)),
        system: bindTranscription(
          createSystemTranscription({ permissions, language: transcriptionLanguage }),
        ),
      },
      dictation: {
        system: bindDictation(createSystemDictationEngine({ permissions })),
        sensevoice: bindDictation(createSenseVoiceDictationEngine(model, permissions)),
      },
      speech: {
        system: createSystemSpeechEngine({
          voice: () => preference.get('feature.voice.system_voice'),
        }),
      },
    },
    preference,
    language,
    dictationLanguage,
    canSpeakInBackground: () =>
      Platform.OS === 'ios' && preference.readCached('app.background_audio.consent') === true,
    onBackground(listener) {
      const subscription = AppState.addEventListener('change', (state) => {
        // A permission dialog the voice action itself opened is not leaving the app.
        if (state === 'background' && !permissions.isPresentingSystemPrompt()) listener();
      });
      return () => subscription.remove();
    },
  });
  return {
    module: { ...runtime.module, localModel: model.module },
    async dispose() {
      // Stop admission/downloads immediately; runtime joins native recognition before disposal ends.
      await Promise.all([runtime.dispose(), model.dispose()]);
    },
  };
}
