import type { AudioTranscriptionOptions } from '@/shared/contracts/voice';
import { VoiceError } from '@/shared/contracts/voice';

import { getVoiceInput } from '../../../../modules/voice-input';
import { getSenseVoiceStatus, openSenseVoiceRecognizer } from './senseVoiceRecognition';
import { transcribeAudioChunks } from './transcribeAudioChunks';
import type { VoiceModel } from './voiceModel';

export function createSenseVoiceTranscription(model: VoiceModel) {
  return {
    async status(signal: AbortSignal) {
      if (!getVoiceInput()?.decodeAudioChunk) return 'unsupported' as const;
      return getSenseVoiceStatus(model, signal);
    },
    async transcribe(uri: string, options: AudioTranscriptionOptions & { signal: AbortSignal }) {
      if (!getVoiceInput()?.decodeAudioChunk)
        throw new VoiceError('unsupported', 'This client cannot decode audio files.');
      const recognizer = await openSenseVoiceRecognizer(model, options.signal);
      try {
        return await transcribeAudioChunks(uri, recognizer.recognize, options);
      } finally {
        await recognizer.release();
      }
    },
  };
}
