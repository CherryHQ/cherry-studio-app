import { requireOptionalNativeModule } from 'expo';

export type VoiceRecordingResult = { id: string; uri?: string; error?: string };

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
  /** Records mono 16 kHz PCM16 WAV for at most 30 seconds. Permissions are caller-owned. */
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  /** Stops capture and deletes the current recording, joining its native writer. */
  cancel(id: string): Promise<void>;
};

export function getVoiceInput(): VoiceInputModule | null {
  return requireOptionalNativeModule<VoiceInputModule>('VoiceInput');
}
