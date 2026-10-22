import { resolveVoiceEndpoint } from '@cherrystudio/ai-runtime/provider';
import { AppState, Platform } from 'react-native';

import type { ProviderService } from '@/backend/data/services/ProviderService';
import { audioTranscriptCache } from '@/backend/services/file/audioTranscriptCache';
import type { VoiceEngineId, VoiceModelSelection } from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

import { createAiDictationEngine } from './aiDictation';
import { createAiSpeechEngine, type AiSpeechDependencies } from './aiSpeech';
import { createAiTranscriber, type AiTranscriptionDependencies } from './aiTranscription';
import { createAudioFileTranscriber } from './audioFileTranscription';
import type { SystemPromptQueue } from './microphoneAccess';
import { createSystemDictationEngine } from './systemDictation';
import { createSystemSpeechEngine } from './systemSpeech';
import { createVoiceRuntime } from './VoiceRuntime';
import { createVoiceScratch } from './voiceStorage';

type VoicePreferences = {
  get(
    key: 'feature.voice.dictation_engine' | 'feature.voice.speech_engine',
  ): Promise<VoiceEngineId | null>;
  get(
    key: 'feature.voice.speech_model' | 'feature.voice.transcription_model',
  ): Promise<VoiceModelSelection | null>;
  get(key: 'feature.voice.ai_voice' | 'feature.voice.system_voice'): Promise<string>;
};

/**
 * Assembles the host's voice module: the only place that knows which native libraries stand
 * behind each engine. Adding an engine is an adapter plus one entry here.
 */
export function createVoice({
  ai,
  preference,
  providers,
  permissions,
  language,
}: {
  ai: AiTranscriptionDependencies['ai'] & AiSpeechDependencies['ai'];
  preference: VoicePreferences;
  providers: Pick<ProviderService, 'list'>;
  permissions: SystemPromptQueue;
  language(): AppLanguage;
}) {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const scratch = createVoiceScratch();
  const transcriber = createAiTranscriber({ ai, preference });
  const runtime = createVoiceRuntime({
    engines: {
      dictation: {
        system: createSystemDictationEngine({ platform, permissions }),
        ai: createAiDictationEngine({ platform, permissions, transcriber }),
      },
      speech: {
        system: createSystemSpeechEngine({
          voice: () => preference.get('feature.voice.system_voice'),
        }),
        ai: createAiSpeechEngine({ ai, preference, scratch }),
      },
    },
    preference,
    async listProviders(signal) {
      const configured = await providers.list({ enabled: true });
      signal.throwIfAborted();
      return configured
        .filter((provider) => provider.isEnabled && resolveVoiceEndpoint(provider))
        .map(({ id, name }) => ({ id, name }));
    },
    language,
    onBackground(listener) {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'background') listener();
      });
      return () => subscription.remove();
    },
  });
  return {
    module: runtime.module,
    async dispose() {
      await runtime.dispose();
      scratch.dispose();
    },
  };
}

/** The attachment reader's audio port, backed by the configured transcription model. */
export function createAudioAttachmentTranscriber(dependencies: AiTranscriptionDependencies) {
  return createAudioFileTranscriber(createAiTranscriber(dependencies), audioTranscriptCache);
}
