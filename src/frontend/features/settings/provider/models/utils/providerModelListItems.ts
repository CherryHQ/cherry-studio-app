import type { Model } from '@/shared/data/types/model';

import { filterProviderModelsByPurpose, type ProviderModelPurpose } from './providerModelPurpose';

type ProviderModelListSectionPurpose = Exclude<ProviderModelPurpose, 'all'>;

export type ProviderModelListItem =
  | {
      count: number;
      isFirstSection: boolean;
      key: string;
      purpose: ProviderModelListSectionPurpose;
      type: 'section';
    }
  | {
      key: string;
      model: Model;
      type: 'model';
    };

const groupedPurposes: readonly ProviderModelListSectionPurpose[] = ['chat', 'painting'];

export function buildProviderModelListItems(
  models: readonly Model[],
  groupByPurpose: boolean,
): ProviderModelListItem[] {
  if (!groupByPurpose) {
    return models.map((model) => ({ key: `model:${model.id}`, model, type: 'model' }));
  }

  let renderedSectionCount = 0;

  return groupedPurposes.flatMap((purpose) => {
    const purposeModels = filterProviderModelsByPurpose(models, purpose);

    if (purposeModels.length === 0) {
      return [];
    }

    const isFirstSection = renderedSectionCount === 0;
    renderedSectionCount += 1;

    return [
      {
        count: purposeModels.length,
        isFirstSection,
        key: `section:${purpose}`,
        purpose,
        type: 'section' as const,
      },
      ...purposeModels.map((model) => ({
        key: `model:${model.id}`,
        model,
        type: 'model' as const,
      })),
    ];
  });
}
