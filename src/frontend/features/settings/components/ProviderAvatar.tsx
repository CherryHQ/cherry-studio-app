import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useMemo } from 'react';
import { useUniwind } from 'uniwind';

import { BrandAvatar, BrandAvatarIcon, BrandAvatarPhoto } from '@/frontend/components/BrandAvatar';
import { useBackendModule } from '@/frontend/data';

/**
 * Reads a provider's stored custom avatar uri (see `providerAvatarStorage`).
 * The lookup is a synchronous file-system stat, memoized per `providerId`, so
 * the avatar is available on first render without a cascading re-render.
 */
export function useProviderAvatar(providerId: string): string | undefined {
  const providers = useBackendModule('providers');
  return useMemo(() => providers.resolveAvatar(providerId), [providerId, providers]);
}

type ProviderAvatarProps = {
  presetProviderId?: string;
  providerId: string;
  providerName: string;
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
}: ProviderAvatarProps) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const avatarUri = useProviderAvatar(providerId);

  if (avatarUri) {
    return (
      <BrandAvatar label={providerName}>
        <BrandAvatarPhoto uri={avatarUri} />
      </BrandAvatar>
    );
  }

  const displayIconId = presetProviderId ?? providerId;
  const iconSource = resolveProviderIcon(displayIconId);

  if (iconSource) {
    return (
      <BrandAvatar label={providerName}>
        <BrandAvatarIcon
          iconId={displayIconId}
          recyclingKey={providerId}
          source={iconSource[iconTheme]}
        />
      </BrandAvatar>
    );
  }

  return <BrandAvatar label={providerName} />;
}
