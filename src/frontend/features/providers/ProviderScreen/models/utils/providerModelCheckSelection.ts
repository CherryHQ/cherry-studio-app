import type { Model } from '@/shared/data/types/model';

/**
 * The model is picked on a screen of its own and travels back as a route param,
 * so the row that shows the choice and the list that highlights it resolve the
 * same fallback before anything has been picked.
 */
export function resolveProviderModelCheckModel(
  models: readonly Model[],
  selectedModelId: string | undefined,
): Model | null {
  return models.find((model) => model.id === selectedModelId) ?? models[0] ?? null;
}
