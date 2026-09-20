import type { GatedSampling } from '@cherrystudio/ai-runtime/utils';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';

import type {
  TranslationAvailability,
  TranslationErrorCode,
  TranslationInput,
  TranslationModule,
  TranslationSession,
  TranslationSnapshot,
  TranslationSurface,
} from '@/shared/contracts/translation';
import type { PreferenceClient } from '@/shared/data/preference';
import type { UniqueModelId } from '@/shared/data/types/model';

import {
  isTranslationLanguage,
  TRANSLATION_MAX_INPUT_LENGTH,
  TRANSLATION_MAX_OUTPUT_LENGTH,
  TRANSLATION_TIMEOUT_MS,
  readTranslationSettings,
  translationPrompt,
} from './translationRequest';

type TranslationDependencies = {
  preferences: Pick<PreferenceClient, 'getCachedValue'>;
  subscribeAvailability(listener: () => void): () => void;
  getAvailability(surface: TranslationSurface): Promise<TranslationAvailability>;
  generate(input: {
    uniqueModelId: UniqueModelId;
    prompt: string;
    reasoningEffort: ReasoningEffortOption;
    sampling: GatedSampling;
    signal: AbortSignal;
  }): Promise<{ text: string; finishReason?: string }>;
  subscribeConfigurationChange(listener: () => void): () => void;
};

export function createTranslationModule(dependencies: TranslationDependencies): TranslationModule {
  return {
    subscribeAvailability: dependencies.subscribeAvailability,
    getAvailability: dependencies.getAvailability,
    createSession: (input) => createTranslationSession(dependencies, input),
  };
}

function createTranslationSession(
  dependencies: TranslationDependencies,
  input: TranslationInput,
): TranslationSession {
  let snapshot: TranslationSnapshot = {
    status: 'ready',
    text: input.text,
    targetLanguage: input.targetLanguage,
  };
  const listeners = new Set<() => void>();
  const controller = new AbortController();
  const aborted = new Promise<void>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(), { once: true });
  });
  let running: Promise<void> | undefined;
  let stopConfigurationListener: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const emit = (next: TranslationSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const stop = () => {
    if (timeout !== undefined) clearTimeout(timeout);
    timeout = undefined;
    stopConfigurationListener?.();
    stopConfigurationListener = undefined;
  };
  const fail = (error: TranslationErrorCode) => {
    if (snapshot.status !== 'running' && snapshot.status !== 'ready') return;
    const { text, targetLanguage, model } = snapshot;
    emit({ status: 'failed', text, targetLanguage, model, error });
    controller.abort();
    stop();
  };
  const perform = async () => {
    const initial = snapshot;
    if (initial.status !== 'ready') return;
    if (!initial.text.trim()) return fail('invalidInput');
    if (initial.text.length > TRANSLATION_MAX_INPUT_LENGTH) return fail('inputTooLarge');
    if (initial.targetLanguage && !isTranslationLanguage(initial.targetLanguage)) {
      return fail('invalidInput');
    }
    emit({ ...initial, status: 'running' });
    stopConfigurationListener = dependencies.subscribeConfigurationChange(() =>
      fail('configurationStale'),
    );
    timeout = setTimeout(() => fail('timedOut'), TRANSLATION_TIMEOUT_MS);
    try {
      const availability = await dependencies.getAvailability('app');
      if (controller.signal.aborted || snapshot.status !== 'running') return;
      if (availability.status !== 'ready') return fail(availability.reason);
      const targetLanguage = initial.targetLanguage ?? availability.targetLanguage;
      if (!isTranslationLanguage(targetLanguage)) return fail('invalidInput');
      const context = { text: initial.text, targetLanguage, model: availability.model };
      emit({ ...context, status: 'running' });
      const settings = readTranslationSettings(dependencies.preferences);
      const result = await dependencies.generate({
        uniqueModelId: availability.model.id,
        prompt: translationPrompt(settings.promptTemplate, initial.text, targetLanguage),
        reasoningEffort: settings.reasoningEffort,
        sampling: settings.sampling,
        signal: controller.signal,
      });
      if (controller.signal.aborted || snapshot.status !== 'running') return;
      if (
        !result.text.trim() ||
        result.text.length > TRANSLATION_MAX_OUTPUT_LENGTH ||
        (result.finishReason !== undefined && result.finishReason !== 'stop')
      ) {
        return fail('invalidResult');
      }
      emit({ ...context, status: 'succeeded', result: result.text });
    } catch (error) {
      // Provider errors may contain both the input and credentials. Retain only a closed code.
      if (!controller.signal.aborted) fail(classifyTranslationError(error));
    } finally {
      stop();
    }
  };
  const cancel = () => {
    if (snapshot.status === 'disposed' || snapshot.status === 'cancelled') return;
    controller.abort();
    stop();
    emit({ status: 'cancelled' });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      if (snapshot.status === 'disposed') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    run: () => (running ??= Promise.race([perform(), aborted])),
    cancel,
    dispose: () => {
      if (snapshot.status === 'disposed') return;
      controller.abort();
      stop();
      emit({ status: 'disposed' });
      listeners.clear();
    },
  };
}

function classifyTranslationError(error: unknown): TranslationErrorCode {
  if (error && typeof error === 'object') {
    const record = error as { statusCode?: unknown; status?: unknown; name?: unknown };
    const status = record.statusCode ?? record.status;
    if (status === 401 || status === 403) return 'authenticationFailed';
    if (status === 429) return 'rateLimited';
    if (status === 408 || status === 504 || record.name === 'TimeoutError') return 'timedOut';
  }
  return error instanceof TypeError ? 'networkUnavailable' : 'failed';
}
