import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

/** Engines a capability can run on. Each engine is one adapter under `backend/services/voice`. */
export const VOICE_ENGINES = ['system', 'sensevoice', 'deepseek'] as const;
export type VoiceEngineId = (typeof VOICE_ENGINES)[number];

/** Dictation captures speech; transcription reads audio files; speech reads text aloud. */
export type VoiceCapability = 'dictation' | 'speech' | 'transcription';

/** Dictation is opt-in; speech finds a supported engine; transcription defaults to SenseVoice. */
export const VOICE_ENGINE_PREFERENCE = {
  dictation: 'feature.voice.dictation_engine',
  speech: 'feature.voice.speech_engine',
  transcription: 'feature.voice.transcription_engine',
} as const satisfies Record<VoiceCapability, string>;

/** `needs-setup` requires device configuration; `needs-service` needs cloud credentials. */
export type VoiceEngineStatus =
  | 'ready'
  | 'needs-setup'
  | 'needs-model'
  | 'needs-service'
  | 'unsupported';

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
  /** Reject execution if the engine advertised by the caller is no longer selected. */
  expectedEngine?: VoiceEngineId;
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

export type SpeechPhase = 'preparing' | 'playing' | 'paused';

export type SpeechSourceRef =
  | { kind: 'local'; sessionId: string }
  | { kind: 'desktop'; connectionId: string; sessionId: string };

export type SpeechMetadata = {
  title?: string;
  subtitle?: string;
  source?: SpeechSourceRef;
};

export type SpeechProgress = {
  completedChunks: number;
  totalChunks: number;
};

/**
 * Privacy-safe localized labels published to system media surfaces (lock screen, notification
 * shade, control center). Keep titles generic; never pass conversation titles or message prose.
 */
export type SpeakSystemLabels = {
  title: string;
  subtitle: string;
  channelName: string;
  play: string;
  pause: string;
  stop: string;
  deepLinkUrl?: string;
};

export type SpeakOptions = VoiceRequestOptions & {
  /** Caller identity of the text being read, for example a message id. */
  key?: string;
  /** In-app conversation and agent presentation for the reading capsule. */
  metadata?: SpeechMetadata;
  /** Localized system media controls for an opted-in background reading. */
  systemLabels?: SpeakSystemLabels;
};

export type SpeechStopTarget = {
  key?: string;
  source?: SpeechSourceRef;
};

export function isSameSpeechSource(
  a: SpeechSourceRef | undefined,
  b: SpeechSourceRef | undefined,
): boolean {
  if (!a || !b || a.kind !== b.kind || a.sessionId !== b.sessionId) return false;
  return a.kind === 'local' || (b.kind === 'desktop' && a.connectionId === b.connectionId);
}

export type VoiceActivity =
  | { kind: 'idle' }
  | { kind: 'dictating' }
  | {
      kind: 'transcribing';
      fileEntryId: FileEntryId;
      key?: string;
      progress?: AudioTranscriptionProgress;
    }
  | {
      kind: 'speaking';
      key: string | null;
      phase: SpeechPhase;
      metadata?: SpeechMetadata;
      progress?: SpeechProgress;
    };

export type VoiceErrorCode =
  | 'unsupported'
  | 'not-configured'
  | 'service-not-configured'
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
  getReadyTranscriptionEngine(options?: VoiceRequestOptions): Promise<VoiceEngineId | null>;
  /** Creates a managed text document; an explicitly selected cloud engine uploads audio windows. */
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
  pauseSpeaking(): void;
  resumeSpeaking(): void;
  togglePauseSpeaking(): void;
  stopSpeaking(match?: SpeechStopTarget): void;
  getActivity(): VoiceActivity;
  subscribeActivity(listener: () => void): () => void;
}
