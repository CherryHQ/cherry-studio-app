import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';

import type { PreferenceKeyType } from '@/shared/data/preference';

export const MODEL_SETTING_KINDS = ['default', 'fast', 'translate'] as const;

export type ModelSettingKind = (typeof MODEL_SETTING_KINDS)[number];

export type ModelSettingSelectionState = Record<ModelSettingKind, UniqueModelId | null>;

export const MODEL_SETTING_PREFERENCE_KEYS = {
  default: 'chat.default_model_id',
  fast: 'feature.quick_assistant.model_id',
  translate: 'feature.translate.model_id',
} as const satisfies Record<ModelSettingKind, PreferenceKeyType>;

export const MODEL_SETTING_KIND_TITLE_KEYS: Record<ModelSettingKind, string> = {
  default: 'settings.model.default.title',
  fast: 'settings.model.fast.title',
  translate: 'settings.model.translate.title',
};

export function getNextModelSelection(
  selectedModelId: string | null,
  optionId: UniqueModelId,
): UniqueModelId | null {
  return selectedModelId === optionId ? null : optionId;
}
