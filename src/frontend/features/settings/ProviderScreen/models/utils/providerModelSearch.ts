import { matchesSearchKeywords, toSearchKeywords } from '@/frontend/utils/search';
import type { Model } from '@/shared/data/types/model';

export function filterModelsByKeywords(searchText: string, models: Model[]): Model[] {
  const keywords = toSearchKeywords(searchText);

  if (keywords.length === 0) {
    return models;
  }

  return models.filter((model) =>
    matchesSearchKeywords(keywords, [model.id, model.name, model.group, model.description]),
  );
}
