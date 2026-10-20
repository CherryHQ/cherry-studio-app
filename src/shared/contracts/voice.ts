export const MAX_VOICE_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_VOICE_TEXT_LENGTH = 4096;
export const MAX_VOICE_RECORDING_SECONDS = 120;

export type VoiceOperation = 'speech' | 'transcription';
export type VoiceModelSelection = { providerId: string; modelId: string };
export type VoiceProviderOption = {
  id: string;
  name: string;
};
export type VoiceAudio = { id: string; uri: string };
export type VoiceRequestOptions = { signal?: AbortSignal };
export type SpeechInput = VoiceModelSelection & { text: string; voice: string };
export type TranscriptionInput = VoiceModelSelection & { uri: string };
export type VoiceErrorCode =
  | 'provider-unavailable'
  | 'invalid-input'
  | 'audio-too-large'
  | 'text-too-long'
  | 'empty-transcript'
  | 'failed';

export class VoiceError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'VoiceError';
  }
}

/** Explicit, local-account voice operations. Callers own review, playback, and cancellation. */
export interface VoiceModule {
  listProviders(options?: VoiceRequestOptions): Promise<VoiceProviderOption[]>;
  requestMicrophoneAccess(options?: VoiceRequestOptions): Promise<{
    granted: boolean;
    canAskAgain: boolean;
  }>;
  /** Reads caller-owned local bytes. The source file is never deleted by this operation. */
  transcribe(input: TranscriptionInput, options?: VoiceRequestOptions): Promise<string>;
  /** A temporary WAV lease; release it after detaching the player. */
  generateSpeech(input: SpeechInput, options?: VoiceRequestOptions): Promise<VoiceAudio>;
  releaseAudio(id: string): Promise<void>;
}
