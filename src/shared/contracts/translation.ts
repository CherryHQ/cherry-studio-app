import type { AppLanguage } from '@/shared/utils/languages';

export type TranslationInput = { text: string; language: AppLanguage };
export type TranslationOptions = {
  signal?: AbortSignal;
  /** Complete text received so far, delivered only while this request is active. */
  onText?: (text: string) => void;
};
export type TranslationErrorCode = 'model-unavailable' | 'failed';

export class TranslationError extends Error {
  constructor(
    readonly code: TranslationErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'TranslationError';
  }
}

/** Read-only text translation. Callers own display, cancellation and saved results. */
export interface TranslationModule {
  /** Resolves only with complete, non-empty text, and never once `options.signal` has aborted. */
  translate(input: TranslationInput, options?: TranslationOptions): Promise<string>;
}
