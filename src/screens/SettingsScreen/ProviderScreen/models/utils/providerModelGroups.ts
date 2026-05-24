import type { Model } from '@/data/types/model';

export const UNGROUPED_MODEL_GROUP_KEY = '__ungrouped__';

export type ProviderModelGroup = {
  groupName: string;
  models: Model[];
};

export function getModelGroupLabel(groupName: string, t: (key: string) => string): string {
  return groupName === UNGROUPED_MODEL_GROUP_KEY
    ? t('settings.provider.models.ungrouped')
    : groupName;
}

export function groupModels(models: Model[]): ProviderModelGroup[] {
  const grouped = models.reduce<Record<string, Model[]>>((acc, model) => {
    const groupName = normalizeModelGroupName(model.group);
    acc[groupName] = [...(acc[groupName] ?? []), model];
    return acc;
  }, {});

  return Object.entries(grouped)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupName, groupedModels]) => ({
      groupName,
      models: groupedModels,
    }));
}

export function filterModelsByKeywords(searchText: string, models: Model[]): Model[] {
  const keywords = searchText
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    return models;
  }

  return models.filter((model) => {
    const haystack = [model.id, model.name, model.group, model.description]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();

    return keywords.every((keyword) => haystack.includes(keyword));
  });
}

function normalizeModelGroupName(group: string | null | undefined): string {
  const normalizedGroup = group?.trim();

  if (normalizedGroup && normalizedGroup.toLowerCase() !== 'undefined') {
    return normalizedGroup;
  }

  return UNGROUPED_MODEL_GROUP_KEY;
}
