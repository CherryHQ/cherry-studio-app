import { Image } from '@cherrystudio/ui/components';
import { resolveModelIcon, resolveModelProviderIcon } from '@cherrystudio/ui/icons';
import { Text, View } from 'react-native';
import { useUniwind } from 'uniwind';

import { PROVIDER_BRAND_ICON_SCALE } from '@/frontend/components/Avatar';
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
  const modelIconSource = resolveModelIcon(model.modelId);
  const iconSource = provider
    ? (modelIconSource ??
      resolveModelProviderIcon(model.modelId, provider.presetProviderId ?? provider.id))
    : modelIconSource;
  const imageSize = modelIconSource ? size : size * PROVIDER_BRAND_ICON_SCALE;
  const avatarInitial = model.name.trim().charAt(0).toUpperCase() || 'M';
  const frameStyle = {
    borderRadius: size / 2,
    height: size,
    width: size,
  };

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
