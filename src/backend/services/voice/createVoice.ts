import { AppState } from 'react-native';

import { fileContent } from '@/backend/services/file/fileContent';
import type {
  VOICE_ENGINE_PREFERENCE,
  VoiceCapability,
  VoiceEngineId,
} from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import type { TranscriptionEngine } from './engines';
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
}: {
  preference: VoicePreferences;
  permissions: SystemPromptQueue;
  language(): AppLanguage;
  dictationLanguage(): AppLanguage;
  transcriptionLanguage(): AppLanguage;
}) {
  const model = createVoiceModel();
  const bindTranscription = (
    engine: ReturnType<typeof createSenseVoiceTranscription>,
  ): TranscriptionEngine => ({
    status: engine.status,
    run: (input, options) => transcribeAudioFile(fileContent, engine.transcribe, input, options),
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
        system: createSystemDictationEngine({ permissions }),
        sensevoice: createSenseVoiceDictationEngine(model, permissions),
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
