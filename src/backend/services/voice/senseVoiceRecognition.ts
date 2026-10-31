import { TurboModuleRegistry } from 'react-native';

import { VoiceError, type VoiceEngineStatus } from '@/shared/contracts/voice';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { getVoiceInput } from '../../../../modules/voice-input';
import type { VoiceModel } from './voiceModel';

const logger = loggerService.withContext('SenseVoice');

export function isSenseVoiceAvailable(): boolean {
  return !!getVoiceInput() && !!TurboModuleRegistry.get('SherpaOnnx');
}

export async function getSenseVoiceStatus(
  model: VoiceModel,
  signal: AbortSignal,
): Promise<VoiceEngineStatus> {
  if (!isSenseVoiceAvailable()) return 'unsupported';
  try {
    return (await model.isReady(signal)) ? 'ready' : 'needs-model';
  } catch {
    signal.throwIfAborted();
    return 'needs-model';
  }
}

/** Dictation and file transcription share the native singleton under VoiceRuntime's activity. */
export async function openSenseVoiceRecognizer(model: VoiceModel, signal: AbortSignal) {
  signal.throwIfAborted();
  const lease = await model.acquire(signal);
  let sherpa: typeof import('@siteed/sherpa-onnx.rn') | undefined;
  async function release() {
    try {
      // Native inference must settle before its recognizer or model files can be released.
      await sherpa?.ASR.release();
    } catch {
      logger.warn('Offline recognizer cleanup failed');
    } finally {
      lease.release();
    }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- old clients lack this native module
    sherpa = require('@siteed/sherpa-onnx.rn') as typeof import('@siteed/sherpa-onnx.rn');
    signal.throwIfAborted();
    const initialized = await sherpa.ASR.initialize({
      modelDir: decodeURIComponent(new URL(lease.directory).pathname),
      modelType: 'sense_voice',
      modelFiles: { model: 'model.int8.onnx', tokens: 'tokens.txt' },
      numThreads: 2,
      provider: 'cpu',
      streaming: false,
      language: 'auto',
      useItn: true,
    });
    if (!initialized.success)
      throw new VoiceError('failed', 'Offline recognizer initialization failed.');
    signal.throwIfAborted();
  } catch (error) {
    await release();
    signal.throwIfAborted();
    if (error instanceof VoiceError) throw error;
    throw new VoiceError('failed', 'Offline recognizer could not start.', { cause: error });
  }
  const recognizer = sherpa.ASR;
  return {
    async recognize(uri: string) {
      signal.throwIfAborted();
      const result = await recognizer.recognizeFromFile(decodeURIComponent(new URL(uri).pathname));
      signal.throwIfAborted();
      if (!result.success) throw new VoiceError('failed', 'Offline recognition failed.');
      // Only prose enters the document; language/emotion/event tags are recognizer metadata.
      return (result.text ?? '').replace(/<\|[^|]*\|>/g, '').trim();
    },
    release,
  };
}
