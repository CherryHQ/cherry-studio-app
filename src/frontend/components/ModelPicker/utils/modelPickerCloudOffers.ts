import { toCloudModelPreview, type CloudModelOffer } from '@/frontend/appShell/cloud';
import { matchesSearchKeywords } from '@/frontend/utils/search';
import { CLOUD_PROVIDER_ID, CLOUD_PROVIDER_NAME } from '@/shared/contracts/cloud';

import { matchesModelPickerBadges, type ModelPickerBadge } from './modelPickerBadges';
import type { ModelPickerGroup } from './modelPickerData';
import type { ModelPickerOfferItem, ModelPickerDisplayGroup } from './modelPickerListItems';

export const EMPTY_CHERRY_AI_GROUP: ModelPickerGroup = {
  items: [],
  key: `provider:${CLOUD_PROVIDER_ID}`,
  provider: { id: CLOUD_PROVIDER_ID, name: CLOUD_PROVIDER_NAME },
  title: CLOUD_PROVIDER_NAME,
};

/** Locked offers are browse-only, even if an earlier account left a selectable local row. */
export function addCloudOffers(
  groups: readonly ModelPickerGroup[],
  offers: ReadonlyMap<string, CloudModelOffer>,
  keywords: readonly string[],
  selectedBadge: ModelPickerBadge | null,
  amdName: string,
): readonly ModelPickerDisplayGroup[] {
  const locked: ModelPickerOfferItem[] = [];
  for (const offer of offers.values()) {
    if (!offer.reason) continue;
    const model = toCloudModelPreview(offer.model);
    if (
      !matchesSearchKeywords(keywords, [
        model.modelId,
        model.name,
        CLOUD_PROVIDER_NAME,
        ...(offer.isAmd ? [amdName] : []),
      ])
    )
      continue;
    if (selectedBadge && !matchesModelPickerBadges(model, [selectedBadge], offer.model.is_free))
      continue;
    locked.push({
      offer,
      isCloudFree: offer.model.is_free,
      key: `${model.id}:provider`,
      model,
      modelId: model.id,
      provider: EMPTY_CHERRY_AI_GROUP.provider,
    });
  }
  const group = groups.find((group) => group.provider.id === CLOUD_PROVIDER_ID);
  const available =
    group?.items.filter((item) => {
      const offer = offers.get(item.model.modelId);
      return offer && !offer.reason;
    }) ?? [];
  const items = [...locked, ...available];
  if (!group) return items.length ? [{ ...EMPTY_CHERRY_AI_GROUP, items }, ...groups] : groups;
  return groups.flatMap<ModelPickerDisplayGroup>((item) =>
    item !== group ? [item] : items.length ? [{ ...item, items }] : [],
  );
}
