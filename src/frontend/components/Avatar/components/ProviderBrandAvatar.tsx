import { resolveProviderIcon } from '@cherrystudio/ui/icons';

import { BrandAvatar, BrandAvatarIcon } from './BrandAvatar';

type ProviderBrandAvatarProps = {
  presetProviderId?: string;
  providerId: string;
  providerName: string;
  shape?: 'circle' | 'rounded';
  size?: number;
  testID?: string;
};

/**
 * Provider brand logo with the app-wide built-in-icon → generated-initial
 * fallback. Custom uploaded photos stay feature-owned because their storage is
 * settings data, while this presentation is shared by any provider surface.
 */
export function ProviderBrandAvatar({
  presetProviderId,
  providerId,
  providerName,
  shape,
  size,
  testID,
}: ProviderBrandAvatarProps) {
  const displayIconId = presetProviderId ?? providerId;
  const iconSource = resolveProviderIcon(displayIconId);
  const frameProps = {
    label: providerName,
    ...(shape !== undefined && { shape }),
    ...(size !== undefined && { size }),
    ...(testID !== undefined && { testID }),
  };

  if (iconSource) {
    return (
      <BrandAvatar {...frameProps}>
        <BrandAvatarIcon displayContext="provider" recyclingKey={providerId} source={iconSource} />
      </BrandAvatar>
    );
  }

  return <BrandAvatar {...frameProps} />;
}
