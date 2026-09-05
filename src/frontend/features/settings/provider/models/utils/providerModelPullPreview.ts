import type { ModelPullPreview } from '@/shared/contracts';
import type { Model } from '@/shared/data/types/model';

export type ProviderModelPullPreview = ModelPullPreview;

export type ProviderModelPullSectionKey = keyof ProviderModelPullPreview;

export type ProviderModelPullListItem =
  | {
      isFirstSection: boolean;
      key: string;
      section: ProviderModelPullSectionKey;
      type: 'section';
    }
  | {
      key: string;
      model: Model;
      section: ProviderModelPullSectionKey;
      type: 'model';
    };

export function filterProviderModelPullPreview(
  preview: ProviderModelPullPreview,
  searchText: string,
): ProviderModelPullPreview {
  const keywords = searchText
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  if (keywords.length === 0) {
    return preview;
  }

  const matchesSearch = (model: Model) => {
    const haystack = [model.modelId, model.name].join(' ').toLocaleLowerCase();
    return keywords.every((keyword) => haystack.includes(keyword));
  };

  return {
    added: preview.added.filter(matchesSearch),
    missing: preview.missing.filter(matchesSearch),
  };
}

export function buildProviderModelPullListItems(
  preview: ProviderModelPullPreview,
  visibleSections: readonly ProviderModelPullSectionKey[],
): ProviderModelPullListItem[] {
  const visibleSectionSet = new Set(visibleSections);
  const items: ProviderModelPullListItem[] = [];
  const sections: { models: Model[]; section: ProviderModelPullSectionKey }[] = [
    { models: preview.added, section: 'added' },
    { models: preview.missing, section: 'missing' },
  ];
  let renderedSectionCount = 0;

  for (const { models, section } of sections) {
    if (!visibleSectionSet.has(section) || models.length === 0) {
      continue;
    }

    items.push({
      isFirstSection: renderedSectionCount === 0,
      key: `section:${section}`,
      section,
      type: 'section',
    });
    renderedSectionCount += 1;

    for (const model of models) {
      items.push({
        key: `model:${section}:${model.id}`,
        model,
        section,
        type: 'model',
      });
    }
  }

  return items;
}
