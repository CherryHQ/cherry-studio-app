import type {
  DictationSession,
  SpeechVoice,
  VoiceEngineId,
  VoiceEngineStatus,
} from '@/shared/contracts/voice';
import type { AppLanguage } from '@/shared/utils/languages';

export type DictationStart = {
  language: AppLanguage;
  /** Aborting discards capture and rejects the session result. */
  signal: AbortSignal;
  onText(text: string): void;
  onLevel(level: number): void;
  onTranscribing?(): void;
};

/** One way of turning speech into text. Adapters own their native resources and permissions. */
export interface DictationEngine {
  status(signal: AbortSignal): Promise<VoiceEngineStatus>;
  /** Resolves once capture has started. */
  start(input: DictationStart): Promise<DictationSession>;
}

export type SpeechRequest = {
  /** Plain prose; the runtime has already removed Markdown. */
  text: string;
  language: AppLanguage;
  /** Aborting stops output and rejects. */
  signal: AbortSignal;
};

/** One way of reading text aloud. */
export interface SpeechEngine {
  status(signal: AbortSignal): Promise<VoiceEngineStatus>;
  listVoices(language: AppLanguage, signal: AbortSignal): Promise<SpeechVoice[]>;
  /** Resolves when the whole text has been read. */
  speak(input: SpeechRequest): Promise<void>;
}

/** An engine may serve only one capability; a missing entry is unsupported. */
export type VoiceEngines = {
  dictation: Partial<Record<VoiceEngineId, DictationEngine>>;
  speech: Partial<Record<VoiceEngineId, SpeechEngine>>;
};
