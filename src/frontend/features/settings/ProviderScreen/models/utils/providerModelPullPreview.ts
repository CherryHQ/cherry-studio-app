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
      /** Where the row sits in its section's grouped card. */
      isFirst: boolean;
      isLast: boolean;
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
  expandedSections: readonly ProviderModelPullSectionKey[],
  visibleSections: readonly ProviderModelPullSectionKey[],
): ProviderModelPullListItem[] {
  const expandedSectionSet = new Set(expandedSections);
  const visibleSectionSet = new Set(visibleSections);
  const items: ProviderModelPullListItem[] = [];
  const sections: { models: Model[]; section: ProviderModelPullSectionKey }[] = [
    { models: preview.added, section: 'added' },
    { models: preview.missing, section: 'missing' },
  ];
  let renderedSectionCount = 0;

  for (const { models, section } of sections) {
    if (!visibleSectionSet.has(section)) {
      continue;
    }

    items.push({
      isFirstSection: renderedSectionCount === 0,
      key: `section:${section}`,
      section,
      type: 'section',
    });
    renderedSectionCount += 1;

    if (!expandedSectionSet.has(section)) {
      continue;
    }

    for (const [index, model] of models.entries()) {
      items.push({
        isFirst: index === 0,
        isLast: index === models.length - 1,
        key: `model:${section}:${model.id}`,
        model,
        section,
        type: 'model',
      });
    }
  }

  return items;
}
