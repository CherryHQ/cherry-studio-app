/**
 * Assistant + Model/Provider capabilities -> final `temperature` / `topP`
 * / `maxOutputTokens`.
 */

import { DEFAULT_ASSISTANT_SETTINGS, type Assistant } from '@/data/types/assistant';
import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

/** `undefined` falls back to the provider default. */
export function getTemperature(assistant: Assistant, model: Model): number | undefined {
  const enableTemperature =
    assistant.settings?.enableTemperature ?? DEFAULT_ASSISTANT_SETTINGS.enableTemperature;
  if (!enableTemperature) return undefined;

  const temperature = assistant.settings?.temperature ?? DEFAULT_ASSISTANT_SETTINGS.temperature;
  const range = model.parameters?.temperature?.range;
  if (!range) return temperature;

  return Math.max(range.min, Math.min(temperature, range.max));
}

/** Temperature wins when both are enabled on mutually-exclusive models. */
export function getTopP(assistant: Assistant, model: Model): number | undefined {
  const enableTopP = assistant.settings?.enableTopP ?? DEFAULT_ASSISTANT_SETTINGS.enableTopP;
  if (!enableTopP) return undefined;

  const topP = assistant.settings?.topP ?? DEFAULT_ASSISTANT_SETTINGS.topP;
  const range = model.parameters?.topP?.range;
  if (!range) return topP;

  return Math.max(range.min, Math.min(topP, range.max));
}

/** Provider timeout override (`flex` tier gets a longer timeout). */
export function getTimeout(_model: Model): number {
  return 30 * 60 * 1000;
}

/** For Claude thinking-token models (pre-4.6) the AI SDK adds the budget on top, so subtract. */
export function getMaxTokens(
  assistant: Assistant,
  _model: Model,
  _provider: Provider,
): number | undefined {
  const enableMaxTokens =
    assistant.settings?.enableMaxTokens ?? DEFAULT_ASSISTANT_SETTINGS.enableMaxTokens;
  const maxTokens = assistant.settings?.maxTokens ?? DEFAULT_ASSISTANT_SETTINGS.maxTokens;

  if (!enableMaxTokens || maxTokens === undefined) return undefined;
  return maxTokens;
}
