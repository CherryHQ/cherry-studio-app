import { requireOptionalNativeModule } from 'expo';

export type VoiceRecordingResult = { id: string; uri?: string; error?: string };

export type VoiceAudioChunk = { uri: string; totalSeconds: number; endSeconds: number };

export type SystemTranscriptionResult = {
  text?: string;
  error?:
    | 'unsupported'
    | 'offline-recognition-unavailable'
    | 'permission-denied'
    | 'busy'
    | 'no-speech'
    | 'failed';
};

type VoiceInputEvents = {
  finished: (event: VoiceRecordingResult) => void;
  level: (event: { id: string; value: number }) => void;
};

type VoiceInputModule = {
  addListener<EventName extends keyof VoiceInputEvents>(
    eventName: EventName,
    listener: VoiceInputEvents[EventName],
  ): { remove(): void };
  /** Persistent model storage excluded from OS backup. */
  modelDirectory(): Promise<string>;
  /** Decodes at most 30 seconds to a temporary mono PCM16 WAV without microphone access. */
  decodeAudioChunk?(
    uri: string,
    startSeconds: number,
    durationSeconds: number,
  ): Promise<VoiceAudioChunk>;
  /** Exact-language offline availability. These methods never select a network recognizer. */
  systemTranscriptionStatus?(language: string): Promise<'ready' | 'needs-setup' | 'unsupported'>;
  transcribeAudioChunk?(
    id: string,
    uri: string,
    language: string,
  ): Promise<SystemTranscriptionResult>;
  cancelTranscription?(id: string): Promise<void>;
  /** Records mono 16 kHz PCM16 WAV for at most 30 seconds. Permissions are caller-owned. */
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  /** Stops capture and deletes the current recording, joining its native writer. */
  cancel(id: string): Promise<void>;
};

export function getVoiceInput(): VoiceInputModule | null {
  return requireOptionalNativeModule<VoiceInputModule>('VoiceInput');
}
