import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useUniwind } from 'uniwind';

import { BrandAvatar, BrandAvatarIcon } from './BrandAvatar';

type ProviderBrandAvatarProps = {
  displayContext?: 'provider-list';
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
  displayContext,
  presetProviderId,
  providerId,
  providerName,
  shape,
  size,
  testID,
}: ProviderBrandAvatarProps) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
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
        <BrandAvatarIcon
          displayContext={displayContext ?? 'provider'}
          iconId={displayIconId}
          recyclingKey={providerId}
          source={iconSource[iconTheme]}
        />
      </BrandAvatar>
    );
  }

  return <BrandAvatar {...frameProps} />;
}
