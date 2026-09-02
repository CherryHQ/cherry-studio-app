import type { Model, UniqueModelId } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

import { matchesModelTypeFilter, type ModelTypeFilter } from './modelTypeFilter';

export type ModelPickerModelItem = {
  key: string;
  model: Model;
  modelId: UniqueModelId;
  provider: Provider;
};

export type ModelPickerGroup = {
  items: ModelPickerModelItem[];
  key: string;
  provider: Provider;
  title: string;
};

export function getModelPickerModelItem(
  modelId: string | null,
  {
    modelType = 'all',
    models,
    providers,
  }: {
    modelType?: ModelTypeFilter;
    models: readonly Model[];
    providers: readonly Provider[];
  },
): ModelPickerModelItem | undefined {
  const selectableModels = getSelectableModelPickerModels(models, providers, modelType);
  const model = selectableModels.find((item) => item.id === modelId);
  const provider = model ? providers.find((item) => item.id === model.providerId) : undefined;

  if (!model || !provider) {
    return undefined;
  }

  return createModelPickerItem({ model, provider, suffix: 'selected' });
}

export function buildModelPickerGroups({
  modelType = 'all',
  models,
  providers,
  searchText,
}: {
  modelType?: ModelTypeFilter;
  models: readonly Model[];
  providers: readonly Provider[];
  searchText: string;
}): ModelPickerGroup[] {
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
  const keywords = getSearchKeywords(searchText);
  const selectableModels = getSelectableModelPickerModels(models, providers, modelType);
  const filteredModels = selectableModels.filter((model) => {
    const provider = providerById.get(model.providerId);

    return provider ? matchesModelPickerKeywords(model, provider, keywords) : false;
  });
  const groups: ModelPickerGroup[] = [];

  for (const provider of providers) {
    if (!provider.isEnabled) {
      continue;
    }

    const providerModels = filteredModels.filter((model) => model.providerId === provider.id);

    if (providerModels.length === 0) {
      continue;
    }

    groups.push({
      items: providerModels.map((model) =>
        createModelPickerItem({ model, provider, suffix: 'provider' }),
      ),
      key: `provider:${provider.id}`,
      provider,
      title: provider.name,
    });
  }

  return groups;
}

function createModelPickerItem({
  model,
  provider,
  suffix,
}: {
  model: Model;
  provider: Provider;
  suffix: string;
}): ModelPickerModelItem {
  return {
    key: `${model.id}:${suffix}`,
    model,
    modelId: model.id,
    provider,
  };
}

function getSelectableModelPickerModels(
  models: readonly Model[],
  providers: readonly Provider[],
  modelType: ModelTypeFilter,
) {
  const enabledProviderIds = new Set(
    providers.flatMap((provider) => (provider.isEnabled ? [provider.id] : [])),
  );

  return models.filter(
    (model) =>
      model.isEnabled &&
      !model.isHidden &&
      enabledProviderIds.has(model.providerId) &&
      matchesModelTypeFilter(model, modelType),
  );
}

function getSearchKeywords(searchText: string): string[] {
  return searchText
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function matchesModelPickerKeywords(
  model: Model,
  provider: Provider,
  keywords: readonly string[],
): boolean {
  if (keywords.length === 0) {
    return true;
  }

  const haystack = [
    model.id,
    model.modelId,
    model.name,
    model.presetModelId,
    model.description,
    provider.id,
    provider.name,
    provider.presetProviderId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

  return keywords.every((keyword) => haystack.includes(keyword));
}
