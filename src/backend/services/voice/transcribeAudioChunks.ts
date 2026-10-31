import { File } from 'expo-file-system';

import { VoiceError, type AudioTranscriptionOptions } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { MAX_AUDIO_DURATION_SECONDS } from '@/shared/utils/audioFileTypes';

import { getVoiceInput, type VoiceAudioChunk } from '../../../../modules/voice-input';

const CHUNK_SECONDS = 30;
const logger = loggerService.withContext('AudioTranscription');

/** Both engines share bounded decoding, progress, limits and temporary-file cleanup. */
export async function transcribeAudioChunks(
  uri: string,
  recognize: (uri: string) => Promise<string>,
  { signal, onProgress }: AudioTranscriptionOptions & { signal: AbortSignal },
) {
  const native = getVoiceInput();
  if (!native?.decodeAudioChunk)
    throw new VoiceError('unsupported', 'This client cannot decode audio files.');
  const paragraphs: string[] = [];
  let offset = 0;
  let totalSeconds = Infinity;
  try {
    while (offset < totalSeconds) {
      signal.throwIfAborted();
      let chunk: VoiceAudioChunk | undefined;
      try {
        try {
          chunk = await native.decodeAudioChunk(uri, offset, CHUNK_SECONDS);
        } catch (error) {
          signal.throwIfAborted();
          throw new VoiceError('invalid-audio', 'The recording could not be decoded.', {
            cause: error,
          });
        }
        signal.throwIfAborted();
        totalSeconds = chunk.totalSeconds;
        if (
          !Number.isFinite(totalSeconds) ||
          totalSeconds <= 0 ||
          !Number.isFinite(chunk.endSeconds) ||
          chunk.endSeconds <= offset ||
          chunk.endSeconds > totalSeconds ||
          chunk.endSeconds > offset + CHUNK_SECONDS + 0.01
        )
          throw new VoiceError('invalid-audio', 'Invalid audio window.');
        if (totalSeconds > MAX_AUDIO_DURATION_SECONDS)
          throw new VoiceError('audio-too-long', 'Audio exceeds the two-hour transcription limit.');
        onProgress?.({ completedSeconds: offset, totalSeconds });
        const text = await recognize(chunk.uri);
        if (text) paragraphs.push(text);
        offset = chunk.endSeconds;
        onProgress?.({ completedSeconds: offset, totalSeconds });
      } finally {
        if (chunk) {
          try {
            const temporary = new File(chunk.uri);
            if (temporary.exists) temporary.delete();
          } catch {
            logger.warn('Temporary transcription audio cleanup failed');
          }
        }
      }
    }
    signal.throwIfAborted();
    const text = paragraphs.join('\n\n');
    if (!text) throw new VoiceError('no-speech', 'No speech was recognized in the recording.');
    return { text, durationSeconds: totalSeconds };
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof VoiceError) throw error;
    throw new VoiceError('failed', 'Offline audio transcription failed.', { cause: error });
  }
}
