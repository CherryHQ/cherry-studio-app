/**
 * Assistant + Model/Provider capabilities -> final `temperature` / `topP`
 * / `maxOutputTokens`.
 *
 * Capability gating ported from desktop's `src/main/ai/utils/modelParameters.ts`.
 */

import {
  type Assistant,
  DEFAULT_ASSISTANT_SETTINGS,
} from '@cherrystudio/universal/data/types/assistant';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import {
  isClaude46SeriesModel,
  isClaude47SeriesModel,
  isClaudeReasoningModel,
  isGemini3Model,
  isMaxTemperatureOneModel,
  isSupportedThinkingTokenClaudeModel,
  isSupportTemperatureModel,
  isSupportTopPModel,
  isTemperatureTopPMutuallyExclusiveModel,
} from '@cherrystudio/universal/utils/model';
import { loggerService } from '@logger';

import { isAwsBedrockProvider } from './provider';
import type { ResolvedReasoningInvocation } from './reasoningSerializers';

const logger = loggerService.withContext('utils:modelParameters');

/** `undefined` falls back to the provider default. */
export function getTemperature(
  assistant: Assistant,
  model: Model,
  reasoning: Pick<ResolvedReasoningInvocation, 'kind'>,
): number | undefined {
  if (isGemini3Model(model)) {
    logger.info(
      `Gemini 3.x model ${model.id} uses default sampling settings, disabling temperature`,
    );
    return undefined;
  }

  const enableTemperature =
    assistant.settings?.enableTemperature ?? DEFAULT_ASSISTANT_SETTINGS.enableTemperature;
  if (!enableTemperature) return undefined;

  if (isClaude47SeriesModel(model)) {
    logger.info(`Model ${model.id} rejects sampling parameters, disabling temperature`);
    return undefined;
  }

  if (isClaudeReasoningModel(model) && reasoning.kind !== 'omit' && reasoning.kind !== 'off') {
    logger.info(
      `Model ${model.id} does not support reasoning with temperature, disabling temperature`,
    );
    return undefined;
  }

  if (!isSupportTemperatureModel(model)) {
    logger.info(`Model ${model.id} does not support temperature, disabling temperature`);
    return undefined;
  }

  let temperature = assistant.settings?.temperature ?? DEFAULT_ASSISTANT_SETTINGS.temperature;

  if (isMaxTemperatureOneModel(model) && temperature > 1) {
    logger.info(
      `Model ${model.id} has max temperature of 1, clamping temperature from ${temperature} to 1`,
    );
    temperature = 1;
  }

  if (isTemperatureTopPMutuallyExclusiveModel(model) && assistant.settings?.enableTopP) {
    logger.info(
      `Model ${model.id} only accepts one of temperature and topP, both enabled; keeping temperature`,
    );
  }

  const range = model.parameters?.temperature?.range;
  if (!range) return temperature;

  return Math.max(range.min, Math.min(temperature, range.max));
}

/** Temperature wins when both are enabled on mutually-exclusive models. */
export function getTopP(
  assistant: Assistant,
  model: Model,
  reasoning: Pick<ResolvedReasoningInvocation, 'kind'>,
): number | undefined {
  if (isGemini3Model(model)) {
    logger.info(`Gemini 3.x model ${model.id} uses default sampling settings, disabling topP`);
    return undefined;
  }

  const enableTopP = assistant.settings?.enableTopP ?? DEFAULT_ASSISTANT_SETTINGS.enableTopP;
  if (!enableTopP) return undefined;

  if (isClaude47SeriesModel(model)) {
    logger.info(`Model ${model.id} rejects sampling parameters, disabling topP`);
    return undefined;
  }

  if (!isSupportTopPModel(model)) {
    logger.info(`Model ${model.id} does not support topP, disabling topP.`);
    return undefined;
  }

  if (isTemperatureTopPMutuallyExclusiveModel(model) && assistant.settings?.enableTemperature) {
    logger.info(`Model ${model.id} only accepts one of temperature and topP, disabling topP.`);
    return undefined;
  }

  let topP = assistant.settings?.topP ?? DEFAULT_ASSISTANT_SETTINGS.topP;

  if (isClaudeReasoningModel(model) && reasoning.kind !== 'omit' && reasoning.kind !== 'off') {
    const clampedTopP = Math.max(0.95, Math.min(topP, 1));
    if (clampedTopP !== topP) {
      logger.info(
        `Claude Model ${model.id} has reasoning enabled, clamping topP from ${topP} to ${clampedTopP}`,
      );
    }
    topP = clampedTopP;
  }

  const range = model.parameters?.topP?.range;
  if (!range) return topP;

  return Math.max(range.min, Math.min(topP, range.max));
}

/** Drop custom params the model rejects (e.g. `topK` for Gemini 3.x / Claude 4.7). */
export function filterStandardParams(
  standardParams: Record<string, unknown>,
  model: Model,
): Record<string, unknown> {
  if ((isGemini3Model(model) || isClaude47SeriesModel(model)) && 'topK' in standardParams) {
    const { topK, ...rest } = standardParams;
    logger.info(
      `Model ${model.id} rejects sampling parameters, dropping topK=${topK} from custom params`,
    );
    return rest;
  }

  return standardParams;
}

/** Provider timeout override (`flex` tier gets a longer timeout). */
export function getTimeout(_model: Model): number {
  return 30 * 60 * 1000;
}

/** For Claude thinking-token models (pre-4.6) the AI SDK adds the budget on top, so subtract. */
export function getMaxTokens(
  assistant: Assistant,
  model: Model,
  provider: Provider,
  reasoning: Pick<ResolvedReasoningInvocation, 'budgetTokens'>,
): number | undefined {
  const enableMaxTokens =
    assistant.settings?.enableMaxTokens ?? DEFAULT_ASSISTANT_SETTINGS.enableMaxTokens;
  let maxTokens = assistant.settings?.maxTokens ?? DEFAULT_ASSISTANT_SETTINGS.maxTokens;

  if (!enableMaxTokens || maxTokens === undefined) return undefined;

  // Claude 4.6+ adaptive thinking has no budgetTokens, so no subtraction.
  const isAnthropicLike =
    provider.id === 'anthropic' ||
    provider.presetProviderId === 'anthropic' ||
    isAwsBedrockProvider(provider);
  if (
    isSupportedThinkingTokenClaudeModel(model) &&
    !isClaude46SeriesModel(model) &&
    !isClaude47SeriesModel(model) &&
    isAnthropicLike
  ) {
    const budget = reasoning.budgetTokens;
    if (budget) maxTokens -= budget;
  }

  return maxTokens;
}
