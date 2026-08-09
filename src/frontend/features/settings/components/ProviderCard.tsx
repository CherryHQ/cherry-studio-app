import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ProviderAvatar } from './ProviderAvatar';
import { getProviderEndpoints, ProviderEndpointSummary } from './ProviderEndpointSummary';
import { SettingsGroupedSurface } from './SettingsGroupedSurface';

type ProviderCardProvider = Pick<
  Provider,
  'defaultChatEndpoint' | 'endpointConfigs' | 'id' | 'isEnabled' | 'name' | 'presetProviderId'
>;

export type ProviderCardProps = {
  onPress: () => void;
  provider: ProviderCardProvider;
  statusLabel?: string;
};

export const ProviderCard = memo(function ProviderCard({
  onPress,
  provider,
  statusLabel,
}: ProviderCardProps) {
  const endpoints = getProviderEndpoints(provider);
  const accessibilityLabel = [
    provider.name,
    statusLabel,
    ...endpoints.map(({ accessibilityLabel: endpointLabel }) => endpointLabel),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <SettingsGroupedSurface isFirst isLast>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="min-h-40 justify-between gap-4 p-4 active:bg-foreground/5"
        onPress={onPress}
      >
        <View className="flex-row items-start justify-between">
          <ProviderAvatar
            presetProviderId={provider.presetProviderId}
            providerId={provider.id}
            providerName={provider.name}
            size={48}
          />
          {provider.isEnabled ? (
            <View className="mt-1 size-2 rounded-full bg-success" testID="provider-enabled-dot" />
          ) : null}
        </View>
        <View className="gap-1.5">
          <Text className="font-semibold text-foreground text-lg" numberOfLines={2}>
            {provider.name}
          </Text>
          <ProviderEndpointSummary endpoints={endpoints} />
        </View>
      </Pressable>
    </SettingsGroupedSurface>
  );
});
