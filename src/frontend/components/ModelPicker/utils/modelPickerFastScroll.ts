import type { ModelPickerListItem } from './modelPickerListItems';

// The sheet shows roughly ten model rows at once. Below this point regular
// scrolling is clearer than adding a second navigation control.
export const MIN_MODEL_PICKER_FAST_SCROLL_MODEL_COUNT = 12;

export type ModelPickerFastScrollAnchor = {
  key: string;
  label: string;
  listIndex: number;
  provider: Extract<ModelPickerListItem, { type: 'groupHeader' }>['provider'];
};

export type ModelPickerFastScrollNavigation = {
  anchorIndexByListIndex: number[];
  anchors: ModelPickerFastScrollAnchor[];
  modelCount: number;
};

/** Builds one direct LegendList target per provider without changing list order. */
export function buildModelPickerFastScrollNavigation(
  listItems: readonly ModelPickerListItem[],
): ModelPickerFastScrollNavigation {
  const anchors: ModelPickerFastScrollAnchor[] = [];
  const anchorIndexByListIndex: number[] = [];
  let anchorIndex = -1;
  let modelCount = 0;

  for (const [listIndex, item] of listItems.entries()) {
    if (item.type === 'groupHeader') {
      anchors.push({
        key: item.key,
        label: item.title,
        listIndex,
        provider: item.provider,
      });
      anchorIndex += 1;
    } else {
      modelCount += 1;
    }

    anchorIndexByListIndex.push(anchorIndex);
  }

  return { anchorIndexByListIndex, anchors, modelCount };
}

/** Maps a finger position on the inset rail to a provider target. */
export function modelPickerFastScrollIndexAtPosition(
  position: number,
  railHeight: number,
  itemCount: number,
  railInset = 0,
): number {
  'worklet';
  const trackHeight = railHeight - railInset * 2;
  if (trackHeight <= 0 || itemCount <= 0) {
    return -1;
  }

  const normalizedPosition = Math.min(1, Math.max(0, (position - railInset) / trackHeight));
  return Math.min(itemCount - 1, Math.floor(normalizedPosition * itemCount));
}
