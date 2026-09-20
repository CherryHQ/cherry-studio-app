import { type PreferenceClient, PreferenceDefaults } from '@/shared/data/preference';

/** Keep native executors' limits in sync with this contract. */
export const TRANSLATION_MAX_INPUT_LENGTH = 16_000;
export const TRANSLATION_MAX_OUTPUT_LENGTH = 64_000;
export const TRANSLATION_TIMEOUT_MS = 45_000;

export function isTranslationLanguage(value: string): boolean {
  return /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8}){0,3}$/.test(value);
}

export function readTranslationSettings(preferences: Pick<PreferenceClient, 'getCachedValue'>) {
  const read = <K extends keyof typeof PreferenceDefaults>(key: K) =>
    preferences.getCachedValue(key) ?? PreferenceDefaults[key];
  return {
    promptTemplate: read('feature.translate.model_prompt'),
    reasoningEffort: read('feature.translate.reasoning_effort'),
    sampling: {
      enableTemperature: read('feature.translate.enable_temperature'),
      temperature: read('feature.translate.temperature'),
      enableTopP: read('feature.translate.enable_top_p'),
      topP: read('feature.translate.top_p'),
    },
  };
}

export function translationPrompt(template: string, text: string, targetLanguage: string): string {
  return template.replaceAll(/{{target_language}}|{{text}}/g, (placeholder) =>
    placeholder === '{{target_language}}' ? targetLanguage : text,
  );
}
