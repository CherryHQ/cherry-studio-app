import { toCloudModelPreview } from '@/frontend/appShell/cloud';
import { matchesSearchKeywords } from '@/frontend/utils/search';
import {
  CLOUD_PROVIDER_ID,
  CLOUD_PROVIDER_NAME,
  cloudModelUnavailable,
  isCloudAmdModel,
  type CloudModelUse,
  type CloudState,
} from '@/shared/contracts/cloud';

import { matchesModelPickerBadges, type ModelPickerBadge } from './modelPickerBadges';
import type { ModelPickerGroup } from './modelPickerData';
import type { ModelPickerAmdActivationItem, ModelPickerDisplayGroup } from './modelPickerListItems';

export const EMPTY_CHERRY_AI_GROUP: ModelPickerGroup = {
  items: [],
  key: `provider:${CLOUD_PROVIDER_ID}`,
  provider: { id: CLOUD_PROVIDER_ID, name: CLOUD_PROVIDER_NAME },
  title: CLOUD_PROVIDER_NAME,
};

/** Adds browse-only models before an enabled local projection of CherryAI exists. */
export function addAmdActivationModels(
  groups: readonly ModelPickerGroup[],
  cloud: CloudState,
  {
    amdName,
    cloudUse,
    keywords,
    selectedBadge,
  }: {
    amdName: string;
    cloudUse: CloudModelUse;
    keywords: readonly string[];
    selectedBadge: ModelPickerBadge | null;
  },
): readonly ModelPickerDisplayGroup[] {
  const activationItems = cloud.models.flatMap<ModelPickerAmdActivationItem>((model) => {
    if (
      !isCloudAmdModel(model) ||
      cloudModelUnavailable(cloud, model.id, cloudUse) !== 'amd_activation_required' ||
      !matchesSearchKeywords(keywords, [model.id, model.display_name, CLOUD_PROVIDER_NAME, amdName])
    )
      return [];

    const preview = toCloudModelPreview(model);
    if (selectedBadge && !matchesModelPickerBadges(preview, [selectedBadge], true)) return [];

    return [
      {
        requiresAmdActivation: true,
        isCloudFree: true,
        key: `${preview.id}:provider`,
        model: preview,
        modelId: preview.id,
        provider: EMPTY_CHERRY_AI_GROUP.provider,
      },
    ];
  });
  const cherryAiGroup = groups.find((group) => group.provider.id === CLOUD_PROVIDER_ID);
  if (!cherryAiGroup)
    return activationItems.length
      ? [{ ...EMPTY_CHERRY_AI_GROUP, items: activationItems }, ...groups]
      : groups;

  if (
    activationItems.length === 0 &&
    !cherryAiGroup.items.some((item) => item.cloudUnavailable === 'amd_activation_required')
  )
    return groups;

  // The catalog wins if the local query still contains a previously available row.
  const items = [
    ...activationItems,
    ...cherryAiGroup.items.filter((item) => item.cloudUnavailable !== 'amd_activation_required'),
  ];
  return groups.flatMap<ModelPickerDisplayGroup>((group) => {
    if (group !== cherryAiGroup) return [group];
    return items.length > 0 ? [{ ...group, items }] : [];
  });
}
