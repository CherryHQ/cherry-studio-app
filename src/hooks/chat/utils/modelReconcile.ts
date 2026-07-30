import { MODEL_CAPABILITY, REASONING_EFFORT } from '@cherrystudio/provider-registry';

import type { AssistantSettings } from '@/shared/domain/assistant';
import type { Model } from '@/shared/domain/model';

export type ReasoningEffortPatch = {
  reasoning_effort?: string;
};

const DEFAULT_REASONING_OPTION = 'default';
const reasoningEffortCache = new Map<string, string | undefined>();

function getSupportedReasoningOptions(model: Model): string[] {
  const supportedEfforts = model.reasoning?.supportedEfforts ?? [];

  if (supportedEfforts.length === 0 && !model.reasoning?.thinkingTokenLimits) {
    return [];
  }

  return [DEFAULT_REASONING_OPTION, ...supportedEfforts];
}

function getFallbackReasoningEffort(
  model: Model,
  currentEffort: string | undefined,
  cacheKey: string,
): string {
  const supportedOptions = getSupportedReasoningOptions(model);
  const cached = reasoningEffortCache.get(cacheKey);

  if (cached && supportedOptions.includes(cached)) {
    return cached;
  }

  if (currentEffort !== undefined) {
    return (
      model.reasoning?.supportedEfforts?.find((effort) => effort !== REASONING_EFFORT.NONE) ??
      supportedOptions[0] ??
      DEFAULT_REASONING_OPTION
    );
  }

  return supportedOptions[0] ?? DEFAULT_REASONING_OPTION;
}

export function reconcileReasoningEffortForModel(
  nextModel: Model,
  currentEffort: string | undefined,
  assistantId: string,
): ReasoningEffortPatch | null {
  const cacheKey = `assistant.reasoning_effort_cache.${assistantId}`;
  const supportedOptions = getSupportedReasoningOptions(nextModel);

  if (supportedOptions.length > 0) {
    if (currentEffort !== undefined && supportedOptions.includes(currentEffort)) {
      return null;
    }

    const fallback = getFallbackReasoningEffort(nextModel, currentEffort, cacheKey);
    reasoningEffortCache.set(cacheKey, fallback === REASONING_EFFORT.NONE ? undefined : fallback);

    return {
      reasoning_effort: fallback === REASONING_EFFORT.NONE ? undefined : fallback,
    };
  }

  if (currentEffort === undefined) {
    return null;
  }

  reasoningEffortCache.set(cacheKey, currentEffort);
  return {
    reasoning_effort: undefined,
  };
}

export function reconcileWebSearchForModel(
  nextModel: Model,
  current: Pick<AssistantSettings, 'enableWebSearch'>,
): { enableWebSearch: false } | null {
  if (!current.enableWebSearch) {
    return null;
  }

  if (nextModel.capabilities.includes(MODEL_CAPABILITY.WEB_SEARCH)) {
    return null;
  }

  return { enableWebSearch: false };
}
