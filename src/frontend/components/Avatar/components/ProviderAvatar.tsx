import { useProviderAvatar } from '@/frontend/hooks/useProviderAvatar';

import { BrandAvatar, BrandAvatarPhoto } from './BrandAvatar';
import { ProviderBrandAvatar } from './ProviderBrandAvatar';

type ProviderAvatarProps = {
  presetProviderId?: string;
  providerId: string;
  providerName: string;
  /** Passed straight to {@link BrandAvatar}; lists keep the brand default. */
  shape?: 'circle' | 'rounded';
  builtinOnly?: boolean;
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
  shape,
  size,
  builtinOnly,
}: ProviderAvatarProps) {
  const avatarUri = useProviderAvatar(builtinOnly ? undefined : providerId);

  if (avatarUri) {
    return (
      <BrandAvatar label={providerName} shape={shape} size={size}>
        <BrandAvatarPhoto uri={avatarUri} />
      </BrandAvatar>
    );
  }

  return (
    <ProviderBrandAvatar
      presetProviderId={presetProviderId}
      providerId={providerId}
      providerName={providerName}
      shape={shape}
      size={size}
    />
  );
}
