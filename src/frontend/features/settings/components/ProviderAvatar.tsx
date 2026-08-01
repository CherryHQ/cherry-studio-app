import { resolveProviderIcon } from '@cherrystudio/ui/icons';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';
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
  size = 20,
}: ProviderAvatarProps) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const avatarUri = useProviderAvatar(providerId);
  const iconSource = resolveProviderIcon(presetProviderId ?? providerId);
  const initial = providerName.trim().charAt(0).toUpperCase() || 'P';
  const frameStyle = { borderRadius: size / 2, height: size, width: size };

  if (avatarUri) {
    return (
      <View className="overflow-hidden border-continuous" style={frameStyle}>
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={avatarUri}
          source={{ uri: avatarUri }}
          style={{ height: size, width: size }}
        />
      </View>
    );
  }

  if (iconSource) {
    const imageSize = Math.round(size * 0.8125);

    return (
      <View
        className="items-center justify-center overflow-hidden border-continuous"
        style={frameStyle}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          recyclingKey={providerId}
          source={iconSource[iconTheme]}
          style={{ height: imageSize, width: imageSize }}
        />
      </View>
    );
  }

  return (
    <View className="items-center justify-center bg-surface-secondary" style={frameStyle}>
      <Text
        className="font-medium text-default-foreground"
        style={{ fontSize: Math.round(size * 0.5) }}
      >
        {initial}
      </Text>
    </View>
  );
}
