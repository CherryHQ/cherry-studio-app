import type { PreferenceKeyType } from '@/data/preference';
import type { UniqueModelId } from '@/data/types/model';

export const MODEL_SETTING_KINDS = ['default', 'fast', 'translate'] as const;

export type ModelSettingKind = (typeof MODEL_SETTING_KINDS)[number];

export type ModelPickerTarget = ModelSettingKind;

export type ModelSettingOption = {
  id: UniqueModelId;
  label: string;
};

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

export const MODEL_SETTING_OPTIONS: readonly ModelSettingOption[] = [
  { id: 'openai::gpt-4o', label: 'GPT-4o' },
  { id: 'anthropic::claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  { id: 'gemini::gemini-1-5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'deepseek::deepseek-v3', label: 'DeepSeek V3' },
  { id: 'qwen::qwen-max', label: 'Qwen Max' },
];

export function isModelSettingKind(value: string | undefined): value is ModelSettingKind {
  return MODEL_SETTING_KINDS.includes(value as ModelSettingKind);
}

export function isModelPickerTarget(value: string | undefined): value is ModelPickerTarget {
  return isModelSettingKind(value);
}

export function getModelSettingOptionLabel(modelId: string | null) {
  return MODEL_SETTING_OPTIONS.find((option) => option.id === modelId)?.label;
}

export function getNextModelSelection(
  selectedModelId: string | null,
  optionId: UniqueModelId,
): UniqueModelId | null {
  return selectedModelId === optionId ? null : optionId;
}
