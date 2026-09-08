import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';

export function getOnboardingModels({
  local,
  remote,
  providers,
  providerId,
}: {
  local: readonly Model[];
  remote: readonly Model[];
  providers: readonly Provider[];
  providerId?: string;
}): Model[] {
  const availableProviders = new Set(
    providers
      .filter((provider) => provider.id === providerId || provider.isEnabled)
      .map((provider) => provider.id),
  );
  const byId = new Map([...remote, ...local].map((model) => [model.id, model]));
  return [...byId.values()]
    .filter(
      (model) =>
        availableProviders.has(model.providerId) &&
        (!providerId || model.providerId === providerId) &&
        isTextGenerationModel(model),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
