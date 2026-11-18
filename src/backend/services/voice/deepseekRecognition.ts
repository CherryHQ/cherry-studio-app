import { File, Paths } from 'expo-file-system';
import * as z from 'zod';

import {
  isDeepseekConfigured,
  resolveDeepseekConnection,
} from '@/backend/services/providers/deepseekConnection';
import { deepseekUpload, requestDeepseekJson } from '@/backend/services/providers/deepseekHttp';
import {
  VoiceError,
  type AudioTranscriptionOptions,
  type VoiceEngineStatus,
} from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getVoiceInput } from '../../../../modules/voice-input';
import { normalizeDeepseekAudio } from './deepseekAudio';
import type { SystemPromptQueue } from './microphoneAccess';
import { createRecordedDictationEngine } from './recordedDictation';
import { transcribeAudioChunks } from './transcribeAudioChunks';

const transcriptSchema = z.object({
  text: z.string(),
  duration_ms: z.number().nonnegative().max(120_000),
});
const logger = loggerService.withContext('DeepseekRecognition');

async function status(signal: AbortSignal): Promise<VoiceEngineStatus> {
  if (!getVoiceInput()) return 'unsupported';
  return (await isDeepseekConfigured(signal)) ? 'ready' : 'needs-service';
}

async function openRecognizer(signal: AbortSignal, options?: { normalizeSampleRate: boolean }) {
  const connection = await resolveDeepseekConnection(signal);
  return {
    async recognize(uri: string): Promise<string> {
      signal.throwIfAborted();
      const source = new File(uri);
      if (!source.exists) throw new VoiceError('file-unavailable', 'Recording is unavailable.');
      let converted: File | undefined;
      try {
        const normalized = options?.normalizeSampleRate
          ? await normalizeDeepseekAudio(source, signal)
          : undefined;
        signal.throwIfAborted();
        if (normalized) {
          converted = new File(Paths.cache, `deepseek-asr-${globalThis.crypto.randomUUID()}.wav`);
          await converted.write(normalized);
        }
        const file = converted ?? source;
        signal.throwIfAborted();
        if (file.size > 8 * 1024 * 1024)
          throw new VoiceError('file-too-large', 'DeepSeek ASR accepts at most 8 MiB per window.');
        const result = await requestDeepseekJson(
          connection,
          '/v1/tools/asr',
          deepseekUpload(file),
          transcriptSchema,
          signal,
        );
        return result.text.trim();
      } finally {
        try {
          if (converted?.exists) converted.delete();
        } catch {
          logger.warn('Temporary DeepSeek transcription audio cleanup failed');
        }
      }
    },
    async release() {},
  };
}

export function createDeepseekDictation(permissions: SystemPromptQueue) {
  return createRecordedDictationEngine(permissions, status, openRecognizer);
}

export function createDeepseekTranscription() {
  return {
    async status(signal: AbortSignal): Promise<VoiceEngineStatus> {
      if (!getVoiceInput()?.decodeAudioChunk) return 'unsupported';
      return status(signal);
    },
    async transcribe(uri: string, options: AudioTranscriptionOptions & { signal: AbortSignal }) {
      const recognizer = await openRecognizer(options.signal, { normalizeSampleRate: true });
      return transcribeAudioChunks(uri, recognizer.recognize, options);
    },
  };
}
