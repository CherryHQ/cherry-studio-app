import { resolveReasoningEffortForModel } from '@cherrystudio/universal/ai/reasoning';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import {
  isFunctionCallingModel,
  isOpenRouterBuiltInWebSearchModel,
  isWebSearchModel,
} from '@cherrystudio/universal/utils/model';

import type { AssistantSettings } from '@/shared/data/types/assistant';
import type { Model } from '@/shared/data/types/model';

export type ReasoningEffortPatch = {
  reasoning_effort?: ReasoningEffortOption;
};

export function reconcileReasoningEffortForModel(
  nextModel: Model,
  currentEffort: ReasoningEffortOption | undefined,
): ReasoningEffortPatch | null {
  const nextEffort = resolveReasoningEffortForModel(nextModel, currentEffort);
  if (nextEffort === currentEffort) return null;
  return { reasoning_effort: nextEffort };
}

export function reconcileWebSearchForModel(
  nextModel: Model,
  current: Pick<AssistantSettings, 'enableWebSearch'>,
): { enableWebSearch: false } | null {
  if (!current.enableWebSearch) {
    return null;
  }

  if (canModelUseAssistantWebSearch(nextModel)) {
    return null;
  }

  return { enableWebSearch: false };
}

export function canModelUseAssistantWebSearch(model: Model): boolean {
  return (
    isWebSearchModel(model) ||
    isOpenRouterBuiltInWebSearchModel(model) ||
    isFunctionCallingModel(model)
  );
}
