import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useUniwind } from 'uniwind';

import { BrandAvatar, BrandAvatarIcon, BrandAvatarPhoto } from '@/frontend/components/BrandAvatar';

import { useProviderAvatar } from './providerAvatarStore';

type ProviderAvatarProps = {
  presetProviderId?: string;
  providerId: string;
  providerName: string;
  size?: number;
};

/**
 * Provider logo with three-tier fallback (mirrors desktop `ProviderAvatar`):
 * ① uploaded custom avatar → ② built-in brand icon (`resolveProviderIcon`) →
 * ③ first-character placeholder.
 */
export function ProviderAvatar({
  presetProviderId,
  providerId,
  providerName,
  size,
}: ProviderAvatarProps) {
  const avatarUri = useProviderAvatar(providerId);

  if (avatarUri) {
    return (
      <BrandAvatar label={providerName} size={size}>
        <BrandAvatarPhoto uri={avatarUri} />
      </BrandAvatar>
    );
  }

  return (
    <ProviderBrandAvatar
      presetProviderId={presetProviderId}
      providerId={providerId}
      providerName={providerName}
      size={size}
    />
  );
}

/**
 * Tiers ② and ③ on their own — built-in brand icon, else first-character
 * placeholder. This is what a provider looks like with no custom avatar, which
 * is why the provider form uses it as the preview for "reset avatar": unlike
 * {@link ProviderAvatar} it ignores whatever is still on disk.
 */
export function ProviderBrandAvatar({
  presetProviderId,
  providerId,
  providerName,
  size,
}: ProviderAvatarProps) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const displayIconId = presetProviderId ?? providerId;
  const iconSource = resolveProviderIcon(displayIconId);

  if (iconSource) {
    return (
      <BrandAvatar label={providerName} size={size}>
        <BrandAvatarIcon
          iconId={displayIconId}
          recyclingKey={providerId}
          source={iconSource[iconTheme]}
        />
      </BrandAvatar>
    );
  }

  return <BrandAvatar label={providerName} size={size} />;
}
