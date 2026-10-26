/** Engines a capability can run on. Each engine is one adapter under `backend/services/voice`. */
export const VOICE_ENGINES = ['system', 'ai'] as const;
export type VoiceEngineId = (typeof VOICE_ENGINES)[number];

/** `dictation` turns speech into composer text; `speech` reads text aloud. */
export type VoiceCapability = 'dictation' | 'speech';

/** Null disables dictation; speech defaults to the first supported engine. */
export const VOICE_ENGINE_PREFERENCE = {
  dictation: 'feature.voice.dictation_engine',
  speech: 'feature.voice.speech_engine',
} as const satisfies Record<VoiceCapability, string>;

/** `unsupported` cannot run on this device; `needs-setup` lacks a configured model. */
export type VoiceEngineStatus = 'ready' | 'needs-setup' | 'unsupported';

/** A saved catalog model; its API model ID and account are resolved at request time. */
export type VoiceModelSelection = { providerId: string; modelId: string };
export type VoiceProviderOption = { id: string; name: string };
export type SpeechVoice = { id: string; name: string; language?: string };
export type SpeechModelOptions = {
  voices: SpeechVoice[];
  /** Omitted when the model has no declared default and needs an explicit voice ID. */
  defaultVoice?: string;
  acceptsCustomVoice: boolean;
};

export type VoiceRequestOptions = { signal?: AbortSignal };

export type DictationOptions = VoiceRequestOptions & {
  /** The whole transcript so far; engines without live results call it once with the final text. */
  onText?: (text: string) => void;
  /** Input level from 0 to 1 while capturing. */
  onLevel?: (level: number) => void;
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
  | { kind: 'speaking'; key: string | null };

export type VoiceErrorCode =
  | 'unsupported'
  | 'not-configured'
  | 'permission-denied'
  | 'permission-blocked'
  | 'busy'
  | 'no-speech'
  | 'audio-too-large'
  | 'invalid-voice'
  | 'upload-failed'
  | 'playback-failed'
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
 * Device voice input and output. Callers never choose an engine: the user's voice settings do.
 * At most one dictation or speech runs at a time, and backgrounding the app ends it.
 */
export interface VoiceModule {
  getEngineStatus(
    capability: VoiceCapability,
    engine: VoiceEngineId,
    options?: VoiceRequestOptions,
  ): Promise<VoiceEngineStatus>;
  /** Dictation requires a choice; speech defaults to a supported engine. Null means none. */
  getEffectiveEngine(
    capability: VoiceCapability,
    options?: VoiceRequestOptions,
  ): Promise<VoiceEngineId | null>;
  /** Locally configured accounts that can serve the AI engine's audio requests. */
  listProviders(options?: VoiceRequestOptions): Promise<VoiceProviderOption[]>;
  listVoices(engine: VoiceEngineId, options?: VoiceRequestOptions): Promise<SpeechVoice[]>;
  /** Options for an explicit model selection, without selecting credentials or making a request. */
  getSpeechModelOptions(
    model: VoiceModelSelection,
    options?: VoiceRequestOptions,
  ): Promise<SpeechModelOptions>;
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
