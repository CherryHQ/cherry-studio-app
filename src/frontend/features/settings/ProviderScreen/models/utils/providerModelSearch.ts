import type { Model } from '@/shared/data/types/model';

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
