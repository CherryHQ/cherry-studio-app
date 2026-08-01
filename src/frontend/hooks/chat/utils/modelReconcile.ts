import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import { resolveReasoningEffortForModel } from '@cherrystudio/shared/ai/reasoning';
import type { AssistantSettings } from '@cherrystudio/shared/data/types/assistant';
import type { Model } from '@cherrystudio/shared/data/types/model';
import type { ReasoningEffortOption } from '@cherrystudio/shared/types/aiSdk';

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

  if (nextModel.capabilities.includes(MODEL_CAPABILITY.WEB_SEARCH)) {
    return null;
  }

  return { enableWebSearch: false };
}
