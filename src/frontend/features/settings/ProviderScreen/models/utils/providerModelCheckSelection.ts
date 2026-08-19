import type { Model } from '@cherrystudio/universal/data/types/model';

/** Stands for "whichever key the provider would have used anyway". */
export const providerModelCheckDefaultApiKeyValue = '__default__';

export type ProviderModelCheckApiKeyOption = {
  id: string;
  key?: string;
  label: string;
  value: string;
};

/**
 * Both choices are picked on a screen of their own and travel back as route
 * params, so the row that shows the choice and the list that highlights it read
 * the same string — and have to resolve it the same way, including the fallback
 * that applies before anything has been picked.
 */
export function resolveProviderModelCheckModel(
  models: readonly Model[],
  selectedModelId: string | undefined,
): Model | null {
  return models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
}

export function resolveProviderModelCheckApiKey(
  options: readonly ProviderModelCheckApiKeyOption[],
  selectedApiKeyId: string | undefined,
): ProviderModelCheckApiKeyOption | undefined {
  return options.find((option) => option.value === selectedApiKeyId) ?? options[0];
}
