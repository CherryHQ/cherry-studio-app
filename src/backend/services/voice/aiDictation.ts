import {
  AudioModule,
  AudioQuality,
  getRecordingPermissionsAsync,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

import { VoiceError, type DictationSession } from '@/shared/contracts/voice';
import { MAX_AUDIO_ATTACHMENT_BYTES } from '@/shared/utils/audioFileTypes';

import type { AiTranscriber } from './aiTranscription';
import type { DictationEngine } from './engines';
import { requireAccess, type SystemPromptQueue } from './microphoneAccess';
import { deleteFile, takeRecording } from './voiceStorage';

/** Mono 16 kHz AAC in an M4A (audio/mp4) container: enough for speech, about 2 MB in total. */
const MAX_RECORDING_SECONDS = 10 * 60;
const COMMON_OPTIONS = {
  extension: '.m4a',
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 24_000,
  isMeteringEnabled: true,
};
const PLATFORM_OPTIONS = {
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
} as const;
const LEVEL_INTERVAL_MS = 100;
// expo-audio exposes no recorder factory outside its React hook, which builds this native class.
// A local binding keeps eslint-plugin-import from reading the module object as a namespace.
const nativeAudio = AudioModule;

/** Metering is dBFS from -160 to 0; speech sits in the top 60 dB. */
const toLevel = (decibels: number | undefined) =>
  decibels === undefined ? 0 : Math.min(1, Math.max(0, (decibels + 60) / 60));

/** Records with expo-audio, then sends the recording to the transcription model once. */
export function createAiDictationEngine({
  platform,
  permissions,
  transcriber,
}: {
  platform: 'ios' | 'android';
  permissions: SystemPromptQueue;
  transcriber: AiTranscriber;
}): DictationEngine {
  return {
    status: () => transcriber.status(),

    async start({ signal, onText, onLevel }) {
      await requireAccess(
        permissions,
        { get: getRecordingPermissionsAsync, request: requestRecordingPermissionsAsync },
        signal,
      );
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        allowsBackgroundRecording: false,
      });
      const recorder = new nativeAudio.AudioRecorder({
        ...COMMON_OPTIONS,
        ...PLATFORM_OPTIONS[platform],
      });
      let meter: ReturnType<typeof setInterval> | undefined;
      let stopped: Promise<string | null> | undefined;
      // Idempotent: stop, the duration limit, abort and failures all end capture here.
      const stopCapture = () =>
        (stopped ??= (async () => {
          clearInterval(meter);
          try {
            if (recorder.isRecording) await recorder.stop();
            return recorder.uri;
          } finally {
            recorder.release();
            await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
          }
        })());

      let finish!: () => void;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const subscription = recorder.addListener('recordingStatusUpdate', (status) => {
        if (status.isFinished || status.hasError) finish();
      });
      const abort = () => finish();
      signal.addEventListener('abort', abort, { once: true });

      try {
        // Checked inside the cleanup path, which also leaves recording mode.
        signal.throwIfAborted();
        await recorder.prepareToRecordAsync();
        signal.throwIfAborted();
        recorder.record({ forDuration: MAX_RECORDING_SECONDS });
      } catch (error) {
        subscription.remove();
        signal.removeEventListener('abort', abort);
        deleteFile(await stopCapture().catch(() => null));
        throw error;
      }
      meter = setInterval(() => onLevel(toLevel(recorder.getStatus().metering)), LEVEL_INTERVAL_MS);

      const result = (async () => {
        await finished;
        subscription.remove();
        signal.removeEventListener('abort', abort);
        const uri = await stopCapture();
        if (signal.aborted) {
          deleteFile(uri);
          throw signal.reason;
        }
        if (!uri) throw new VoiceError('failed', 'The recording produced no file.');
        const audio = await takeRecording(uri);
        if (audio.length > MAX_AUDIO_ATTACHMENT_BYTES)
          throw new VoiceError('audio-too-large', 'The recording exceeds the upload limit.');
        const { text } = await transcriber.transcribe({ audio, mediaType: 'audio/mp4' }, signal);
        signal.throwIfAborted();
        if (!text.trim()) throw new VoiceError('no-speech', 'No speech was recognized.');
        onText(text.trim());
        return text.trim();
      })();
      void result.catch(() => undefined);
      const session: DictationSession = { result, stop: finish };
      return session;
    },
  };
}
