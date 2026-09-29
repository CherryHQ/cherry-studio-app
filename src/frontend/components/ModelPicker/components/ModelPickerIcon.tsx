import { Image } from '@cherrystudio/ui/components';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { getBrandAvatarIconDisplayConfig } from '@/frontend/components/Avatar';
import { useProviderAvatar } from '@/frontend/hooks/useProviderAvatar';
import { resolveModelIconSources } from '@/frontend/utils/modelIcons';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

type ModelPickerIconProps = {
  model: Model;
  /** Absent while the model's provider is still loading; the initial stands in. */
  provider: Provider | undefined;
  size?: number;
};

export function ModelPickerIcon({ model, provider, size = 32 }: ModelPickerIconProps) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const { iconSource, isProviderFallback, modelIconSource } = resolveModelIconSources(
    model.modelId,
    provider?.presetProviderId ?? provider?.id,
  );
  const providerAvatarUri = useProviderAvatar(provider?.id ?? model.providerId);
  const imageSize =
    !modelIconSource && iconSource
      ? size * getBrandAvatarIconDisplayConfig(iconSource, 'circle').scale
      : size;
  const avatarInitial = model.name.trim().charAt(0).toUpperCase() || 'M';
  const frameStyle = {
    height: size,
    width: size,
  };

  if (isProviderFallback && providerAvatarUri) {
    return (
      <View className="overflow-hidden rounded-full border-continuous" style={frameStyle}>
        <Image
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={providerAvatarUri}
          source={{ uri: providerAvatarUri }}
          style={frameStyle}
        />
      </View>
    );
  }

  if (iconSource) {
    return (
      <View
        className="items-center justify-center overflow-hidden rounded-full border-continuous"
        style={frameStyle}
      >
        <Image
          cachePolicy="memory-disk"
          contentFit="contain"
          recyclingKey={model.id}
          source={iconSource[iconTheme]}
          style={{
            height: imageSize,
            width: imageSize,
          }}
        />
      </View>
    );
  }

  return (
    <View className="items-center justify-center" style={frameStyle}>
      <Text className="font-medium text-foreground text-xs">{avatarInitial}</Text>
    </View>
  );
}
