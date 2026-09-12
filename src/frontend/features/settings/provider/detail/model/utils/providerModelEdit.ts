import type { UpdateModelDto } from '@/shared/data/api/schemas/models';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import {
  buildProviderModelCapabilityFields,
  createInitialProviderModelAddFormState,
  type ProviderModelAddFormState,
} from '../../../models/utils/providerModelAdd';
import { buildModelPricing } from '../../../models/utils/providerModelPricing';

export const modelLimitFields = ['contextWindow', 'maxInputTokens', 'maxOutputTokens'] as const;
export type ModelLimitField = (typeof modelLimitFields)[number];
export type ModelEditDraft = Record<ModelLimitField | 'name' | 'group' | 'notes', string>;

export function createModelEditSettings(model: Model): ProviderModelAddFormState {
  return {
    ...createInitialProviderModelAddFormState(),
    endpointType: model.endpointTypes?.[0] ?? 'auto',
  };
}

export function buildModelEditSettingsPatch(
  model: Model,
  provider: Provider,
  settings: ProviderModelAddFormState,
): { patch?: UpdateModelDto; error?: string } {
  const endpointChanged = settings.endpointType !== (model.endpointTypes?.[0] ?? 'auto');
  const baseline =
    endpointChanged && settings.endpointType === 'auto' ? { ...model, endpointTypes: [] } : model;
  const result = buildProviderModelCapabilityFields(
    { ...settings, endpointType: endpointChanged ? settings.endpointType : 'auto' },
    provider,
    baseline,
  );
  if (result.endpointError) return { error: result.endpointError };
  const patch: UpdateModelDto = { ...result.fields };
  if (endpointChanged) patch.endpointTypes = result.fields.endpointTypes ?? [];
  if (
    settings.supportsStreaming !== undefined &&
    settings.supportsStreaming !== model.supportsStreaming
  )
    patch.supportsStreaming = settings.supportsStreaming;
  if (settings.pricing) {
    const pricingResult = buildModelPricing(settings.pricing, model.pricing);
    if (!pricingResult.pricing) return { error: 'settings.provider.models.pricing.invalidFields' };
    patch.pricing = pricingResult.pricing;
  }
  return { patch };
}

export function createModelEditDraft(model: Model): ModelEditDraft {
  return {
    name: model.name,
    group: model.group ?? '',
    notes: model.notes ?? '',
    contextWindow: model.contextWindow?.toString() ?? '',
    maxInputTokens: model.maxInputTokens?.toString() ?? '',
    maxOutputTokens: model.maxOutputTokens?.toString() ?? '',
  };
}

/** Omitted values stay omitted: editing a name must not materialize catalog limits. */
export function buildModelEditPatch(
  initial: ModelEditDraft,
  draft: ModelEditDraft,
): UpdateModelDto | null {
  if (!draft.name.trim()) return null;
  const patch: UpdateModelDto = {};
  for (const field of ['name', 'group', 'notes'] as const) {
    const value = draft[field].trim();
    if (value !== initial[field]) patch[field] = value;
  }
  for (const field of modelLimitFields) {
    const value = draft[field].trim();
    if (value === initial[field]) continue;
    const number = Number(value);
    if (!value) patch[field] = null;
    else if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number <= 0) return null;
    else patch[field] = number;
  }
  if (modelLimitFields.some((field) => draft[field] !== initial[field])) {
    const context = Number(draft.contextWindow);
    if (context > 0 && Number(draft.maxInputTokens) > context) return null;
    if (context > 0 && Number(draft.maxOutputTokens) >= context) return null;
  }
  return patch;
}
