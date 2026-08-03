import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';
import { useBackendModule } from '@/frontend/data';

import {
  DEFAULT_PROVIDER_ICON_SCALE,
  getProviderAvatarFallback,
  getProviderListIconDisplayConfig,
} from '../utils/providerAvatarStyles';

const PROVIDER_LIST_AVATAR_SIZE = 26;
const PROVIDER_LIST_AVATAR_FRAME_CLASS_NAME =
  'items-center justify-center overflow-hidden border border-border-subtle border-continuous';
const PROVIDER_LIST_AVATAR_FRAME_STYLE = {
  borderRadius: 6,
  height: PROVIDER_LIST_AVATAR_SIZE,
  width: PROVIDER_LIST_AVATAR_SIZE,
};

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
      <View
        className={PROVIDER_LIST_AVATAR_FRAME_CLASS_NAME}
        style={PROVIDER_LIST_AVATAR_FRAME_STYLE}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={avatarUri}
          source={{ uri: avatarUri }}
          style={{ height: PROVIDER_LIST_AVATAR_SIZE, width: PROVIDER_LIST_AVATAR_SIZE }}
        />
      </View>
    );
  }

  const displayIconId = presetProviderId ?? providerId;
  const iconSource = resolveProviderIcon(displayIconId);

  if (iconSource) {
    const displayConfig = getProviderListIconDisplayConfig(displayIconId);
    const imageSize =
      PROVIDER_LIST_AVATAR_SIZE * (displayConfig?.scale ?? DEFAULT_PROVIDER_ICON_SCALE);

    return (
      <View
        className={PROVIDER_LIST_AVATAR_FRAME_CLASS_NAME}
        style={PROVIDER_LIST_AVATAR_FRAME_STYLE}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          recyclingKey={providerId}
          source={iconSource[iconTheme]}
          style={{
            borderRadius: displayConfig?.borderRadius,
            height: imageSize,
            width: imageSize,
          }}
        />
      </View>
    );
  }

  const fallback = getProviderAvatarFallback(providerName);

  return (
    <View
      className={PROVIDER_LIST_AVATAR_FRAME_CLASS_NAME}
      style={{ ...PROVIDER_LIST_AVATAR_FRAME_STYLE, backgroundColor: fallback.backgroundColor }}
    >
      <Text className="font-medium" style={{ color: fallback.color, fontSize: 14 }}>
        {fallback.initial}
      </Text>
    </View>
  );
}
