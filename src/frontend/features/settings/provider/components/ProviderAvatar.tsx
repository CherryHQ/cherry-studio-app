import { BrandAvatar, BrandAvatarPhoto, ProviderBrandAvatar } from '@/frontend/components/Avatar';

import { useProviderAvatar } from '../hooks/useProviderAvatar';

type ProviderAvatarProps = {
  displayContext?: 'provider-list';
  presetProviderId?: string;
  providerId: string;
  providerName: string;
  /** Passed straight to {@link BrandAvatar}; lists keep the brand default. */
  shape?: 'circle' | 'rounded';
  size?: number;
};

/**
 * Provider logo with three-tier fallback (mirrors desktop `ProviderAvatar`):
 * ① uploaded custom avatar → ② built-in brand icon (`resolveProviderIcon`) →
 * ③ first-character placeholder.
 */
export function ProviderAvatar({
  displayContext,
  presetProviderId,
  providerId,
  providerName,
  shape,
  size,
}: ProviderAvatarProps) {
  const avatarUri = useProviderAvatar(providerId);

  if (avatarUri) {
    return (
      <BrandAvatar label={providerName} shape={shape} size={size}>
        <BrandAvatarPhoto uri={avatarUri} />
      </BrandAvatar>
    );
  }

  return (
    <ProviderBrandAvatar
      displayContext={displayContext}
      presetProviderId={presetProviderId}
      providerId={providerId}
      providerName={providerName}
      shape={shape}
      size={size}
    />
  );
}
