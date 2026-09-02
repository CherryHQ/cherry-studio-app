import { Image } from '@cherrystudio/ui/components';
import { resolveIcon } from '@cherrystudio/ui/icons';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';

type ModelPickerIconProps = {
  model: Model;
  /** Absent while the model's provider is still loading; the initial stands in. */
  provider: Provider | undefined;
  providerIconSize?: number;
  size?: number;
};

export function ModelPickerIcon({
  model,
  provider,
  providerIconSize,
  size = 32,
}: ModelPickerIconProps) {
  const { theme } = useUniwind();
  const iconTheme = theme === 'dark' ? 'dark' : 'light';
  const iconSource = provider
    ? resolveIcon(model.modelId, provider.presetProviderId ?? provider.id)
    : null;
  const avatarInitial = model.name.trim().charAt(0).toUpperCase() || 'M';
  const frameStyle = {
    borderRadius: size / 2,
    height: size,
    width: size,
  };
  const imageSize = providerIconSize ?? Math.round(size * 0.8125);

  if (iconSource) {
    return (
      <View
        className="items-center justify-center overflow-hidden border-continuous"
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
