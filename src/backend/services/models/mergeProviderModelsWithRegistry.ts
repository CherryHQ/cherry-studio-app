import type { Model } from '@cherrystudio/universal/data/types/model';

function bareModelKey(model: Partial<Model>): string {
  const modelId = model.apiModelId ?? model.modelId ?? '';
  const afterSlash = modelId.includes('/') ? modelId.slice(modelId.lastIndexOf('/') + 1) : modelId;
  return afterSlash.toLowerCase();
}

export function mergeProviderModelsWithRegistry(
  remote: readonly Partial<Model>[],
  registry: readonly Model[],
): Partial<Model>[] {
  const seen = new Set(remote.map(bareModelKey));
  const missing = registry.filter((model) => !seen.has(bareModelKey(model)));
  return missing.length > 0 ? [...remote, ...missing] : [...remote];
}
