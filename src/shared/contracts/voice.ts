import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

/** Engines a capability can run on. Each engine is one adapter under `backend/services/voice`. */
export const VOICE_ENGINES = ['system', 'sensevoice'] as const;
export type VoiceEngineId = (typeof VOICE_ENGINES)[number];

/** Dictation captures speech; transcription reads audio files; speech reads text aloud. */
export type VoiceCapability = 'dictation' | 'speech' | 'transcription';

/** Dictation is opt-in; speech finds a supported engine; transcription defaults to SenseVoice. */
export const VOICE_ENGINE_PREFERENCE = {
  dictation: 'feature.voice.dictation_engine',
  speech: 'feature.voice.speech_engine',
  transcription: 'feature.voice.transcription_engine',
} as const satisfies Record<VoiceCapability, string>;

/** `needs-setup` requires device configuration; `unsupported` cannot run on this device. */
export type VoiceEngineStatus = 'ready' | 'needs-setup' | 'needs-model' | 'unsupported';

export type VoiceModelState = {
  status:
    | 'not-downloaded'
    | 'checking'
    | 'downloading'
    | 'verifying'
    | 'ready'
    | 'removing'
    | 'failed';
  receivedBytes: number;
  totalBytes: number;
  failure?: 'download' | 'verification' | 'storage';
};

/** One optional downloaded recognizer. Its transfer outlives settings navigation. */
export interface VoiceModelModule {
  getState(): VoiceModelState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  download(): Promise<void>;
  cancel(): Promise<void>;
  remove(): Promise<void>;
}

export type SpeechVoice = { id: string; name: string; language?: string };

export type VoiceRequestOptions = { signal?: AbortSignal };

export type AudioTranscriptionInput = {
  fileEntryId: FileEntryId;
  /** UI chooses the source folder; Agent tools use their captured workspace. */
  folderId?: string | null;
};

export type AudioTranscriptionProgress = { completedSeconds: number; totalSeconds: number };
export type AudioTranscriptionOptions = VoiceRequestOptions & {
  /** Caller identity, such as the Agent tool call, for live progress presentation. */
  key?: string;
  onProgress?: (progress: AudioTranscriptionProgress) => void;
};
export type AudioTranscriptionResult = { entry: FileEntry; durationSeconds: number };

export type DictationOptions = VoiceRequestOptions & {
  /** The whole transcript so far; engines without live results call it once with the final text. */
  onText?: (text: string) => void;
  /** Input level from 0 to 1 while capturing. */
  onLevel?: (level: number) => void;
  /** Capture ended automatically and the engine is producing the final text. */
  onTranscribing?: () => void;
};

export interface DictationSession {
  /** Settles after `stop()`, an engine-initiated end, abort or failure. */
  readonly result: Promise<string>;
  /** Ends capture and keeps what was said. Aborting the start signal discards it instead. */
  stop(): void;
}

export type SpeakOptions = VoiceRequestOptions & {
  /** Caller identity of the text being read, for example a message id. */
  key?: string;
};

export type VoiceActivity =
  | { kind: 'idle' }
  | { kind: 'dictating' }
  | {
      kind: 'transcribing';
      fileEntryId: FileEntryId;
      key?: string;
      progress?: AudioTranscriptionProgress;
    }
  | { kind: 'speaking'; key: string | null };

export type VoiceErrorCode =
  | 'unsupported'
  | 'not-configured'
  | 'recognition-not-configured'
  | 'offline-recognition-unavailable'
  | 'model-not-downloaded'
  | 'permission-denied'
  | 'permission-blocked'
  | 'invalid-voice'
  | 'busy'
  | 'no-speech'
  | 'invalid-audio'
  | 'audio-too-long'
  | 'file-too-large'
  | 'file-unavailable'
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

/**
 * Device voice input and output. Dictation and speech follow the user's engine settings.
 * File transcription defaults to SenseVoice and can use the system's on-device recognizer.
 * One voice operation runs at a time. Backgrounding ends live capture/playback; file work follows its caller's abort signal.
 */
export interface VoiceModule {
  readonly localModel: VoiceModelModule;
  getTranscriptionStatus(options?: VoiceRequestOptions): Promise<VoiceEngineStatus>;
  /** Creates a managed text document without changing or uploading the source recording. */
  transcribeAudio(
    input: AudioTranscriptionInput,
    options?: AudioTranscriptionOptions,
  ): Promise<AudioTranscriptionResult>;
  getEngineStatus(
    capability: VoiceCapability,
    engine: VoiceEngineId,
    options?: VoiceRequestOptions,
  ): Promise<VoiceEngineStatus>;
  /** Dictation requires a choice; transcription defaults to SenseVoice; speech finds support. */
  getEffectiveEngine(
    capability: VoiceCapability,
    options?: VoiceRequestOptions,
  ): Promise<VoiceEngineId | null>;
  listVoices(engine: VoiceEngineId, options?: VoiceRequestOptions): Promise<SpeechVoice[]>;
  /** Resolves once capture has started; a running speech stops first. Rejects `busy` when dictating. */
  startDictation(options?: DictationOptions): Promise<DictationSession>;
  /**
   * Reads Markdown prose aloud, replacing a running speech; rejects `busy` during dictation.
   * Resolves when reading finishes or is stopped.
   */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stopSpeaking(): void;
  getActivity(): VoiceActivity;
  subscribeActivity(listener: () => void): () => void;
}
