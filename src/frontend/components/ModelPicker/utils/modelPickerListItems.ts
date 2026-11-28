import type { CloudModelOffer, toCloudModelPreview } from '@/frontend/appShell/cloud';
import type { UniqueModelId } from '@/shared/data/types/model';

import type { ModelPickerGroup, ModelPickerModelItem } from './modelPickerData';

export type ModelPickerOfferItem = {
  offer: CloudModelOffer;
  isCloudFree: boolean;
  key: string;
  model: ReturnType<typeof toCloudModelPreview>;
  modelId: UniqueModelId;
  provider: ModelPickerGroup['provider'];
};

export type ModelPickerRowItem = ModelPickerModelItem | ModelPickerOfferItem;
export type ModelPickerDisplayGroup = Omit<ModelPickerGroup, 'items'> & {
  items: ModelPickerRowItem[];
};

export type ModelPickerListItem =
  | {
      isFirstGroup: boolean;
      key: string;
      provider: ModelPickerGroup['provider'] & { builtinOnly?: boolean };
      title: string;
      type: 'groupHeader';
    }
  | {
      item: ModelPickerRowItem;
      key: string;
      type: 'model';
    };

// A catalog can supply display-only choices without constructing local Model or Provider records.
export type ModelPickerChoice = {
  type: 'choice';
  key: string;
  name: string;
  description?: string;
  model?: { modelId: string; providerId: string; name: string };
};
export type ModelPickerChoiceListItem =
  | Extract<ModelPickerListItem, { type: 'groupHeader' }>
  | ModelPickerChoice;
export type ModelPickerDisplayItem = ModelPickerListItem | ModelPickerChoice;

export function buildModelPickerListItems(
  groups: readonly ModelPickerDisplayGroup[],
  limit = Number.POSITIVE_INFINITY,
): ModelPickerListItem[] {
  const listItems: ModelPickerListItem[] = [];

  for (const [groupIndex, group] of groups.entries()) {
    const remainingItemCount = limit - listItems.length;

    if (remainingItemCount <= 0 || (remainingItemCount === 1 && group.items.length > 0)) {
      break;
    }

    listItems.push({
      isFirstGroup: groupIndex === 0,
      key: `header:${group.key}`,
      provider: group.provider,
      title: group.title,
      type: 'groupHeader',
    });

    for (const item of group.items) {
      if (listItems.length >= limit) {
        break;
      }

      listItems.push({
        item,
        key: item.key,
        type: 'model',
      });
    }
  }

  return listItems;
}
