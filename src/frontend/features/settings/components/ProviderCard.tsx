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
        className="min-h-32 justify-between gap-3 p-4 active:bg-foreground/5"
        onPress={onPress}
      >
        <View className="flex-row items-center gap-2.5 pr-3">
          <ProviderAvatar
            presetProviderId={provider.presetProviderId}
            providerId={provider.id}
            providerName={provider.name}
            size={36}
          />
          <Text className="min-w-0 flex-1 font-semibold text-foreground text-lg" numberOfLines={2}>
            {provider.name}
          </Text>
        </View>
        {provider.isEnabled ? (
          <View
            className="absolute right-4 top-4 size-2 rounded-full bg-success"
            testID="provider-enabled-dot"
          />
        ) : null}
        <ProviderEndpointSummary endpoints={endpoints} />
      </Pressable>
    </SettingsGroupedSurface>
  );
});
