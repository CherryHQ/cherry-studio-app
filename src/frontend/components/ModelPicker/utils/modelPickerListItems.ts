import type { ModelPickerGroup, ModelPickerModelItem } from './modelPickerData';

export type ModelPickerListItem =
  | {
      isFirstGroup: boolean;
      key: string;
      provider: ModelPickerGroup['provider'];
      title: string;
      type: 'groupHeader';
    }
  | {
      item: ModelPickerModelItem;
      key: string;
      type: 'model';
    };

export function buildModelPickerListItems(
  groups: readonly ModelPickerGroup[],
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
