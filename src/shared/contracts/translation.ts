import type { UniqueModelId } from '@/shared/data/types/model';

export type TranslationSurface = 'app' | 'externalWindow' | 'shortcut';

export type TranslationUnavailableReason =
  | 'modelNotConfigured'
  | 'modelUnavailable'
  | 'providerUnavailable'
  | 'credentialsUnavailable'
  | 'unsupportedProvider'
  | 'configurationStale'
  | 'platformUnavailable';

export type TranslationErrorCode =
  | TranslationUnavailableReason
  | 'invalidInput'
  | 'inputTooLarge'
  | 'networkUnavailable'
  | 'authenticationFailed'
  | 'rateLimited'
  | 'timedOut'
  | 'invalidResult'
  | 'failed';

export type TranslationModel = {
  id: UniqueModelId;
  name: string;
  providerName: string;
};

export type TranslationAvailability =
  | { status: 'ready'; model: TranslationModel; targetLanguage: string }
  | {
      status: 'unavailable';
      reason: TranslationUnavailableReason;
      model?: TranslationModel;
      targetLanguage: string;
    };

export type TranslationInput = { text: string; targetLanguage?: string };

type TranslationContext = {
  text: string;
  targetLanguage?: string;
  model?: TranslationModel;
};

export type TranslationSnapshot =
  | (TranslationContext & { status: 'ready' | 'running' })
  | (TranslationContext & { status: 'succeeded'; result: string })
  | (TranslationContext & { status: 'failed'; error: TranslationErrorCode })
  | { status: 'cancelled' | 'disposed' };

/** A single attempt. Its caller must dispose it on close, retry, or language change. */
export interface TranslationSession {
  getSnapshot(): TranslationSnapshot;
  subscribe(listener: () => void): () => void;
  run(): Promise<void>;
  cancel(): void;
  dispose(): void;
}

export interface TranslationModule {
  subscribeAvailability(listener: () => void): () => void;
  getAvailability(surface: TranslationSurface): Promise<TranslationAvailability>;
  createSession(input: TranslationInput): TranslationSession;
}
