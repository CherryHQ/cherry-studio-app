import { VoiceError } from '@/shared/contracts/voice';

import type { DictationEngine } from './engines';
import type { SystemPromptQueue } from './microphoneAccess';
import { createRecordedDictationEngine } from './recordedDictation';
import {
  getSenseVoiceStatus,
  isSenseVoiceAvailable,
  openSenseVoiceRecognizer,
} from './senseVoiceRecognition';
import type { VoiceModel } from './voiceModel';

export function createSenseVoiceDictationEngine(
  model: VoiceModel,
  permissions: SystemPromptQueue,
): DictationEngine {
  const engine = createRecordedDictationEngine(
    permissions,
    (signal) => getSenseVoiceStatus(model, signal),
    (signal) => openSenseVoiceRecognizer(model, signal),
  );
  return {
    ...engine,
    async start(input) {
      if (!isSenseVoiceAvailable())
        throw new VoiceError('unsupported', 'Offline dictation is unavailable.');
      return engine.start(input);
    },
  };
}
