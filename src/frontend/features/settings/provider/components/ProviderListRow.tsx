import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Section, Spinner, Switch } from '@cherrystudio/ui/components';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ProviderAvatar } from '@/frontend/components/Avatar';
import type { Provider } from '@/shared/data/types/provider';

export const ProviderListRow = memo(function ProviderListRow({
  isEnabled,
  isPending,
  onOpen,
  onToggle,
  provider,
}: {
  isEnabled: boolean;
  isPending: boolean;
  onOpen: (provider: Provider) => void;
  onToggle: (provider: Provider, isEnabled: boolean) => void;
  provider: Provider;
}) {
  const { t } = useTranslation();
  const statusLabel = t(
    isEnabled ? 'settings.provider.status.enabled' : 'settings.provider.status.disabled',
  );

  return (
    <Section.Item
      accessibilityLabel={`${provider.name}, ${statusLabel}`}
      accessibilityState={{ busy: isPending }}
      label={
        <Text className="text-base text-foreground" numberOfLines={1}>
          {provider.name}
        </Text>
      }
      leading={
        <ProviderAvatar
          presetProviderId={provider.presetProviderId}
          providerId={provider.id}
          providerName={provider.name}
        />
      }
      onPress={() => {
        if (!isPending) onOpen(provider);
      }}
      showChevron={false}
      testID={`provider-row-${provider.id}`}
      trailing={
        <View className="flex-row items-center gap-2">
          <Switch
            accessibilityLabel={t(
              isEnabled
                ? 'settings.provider.disableProviderNamed'
                : 'settings.provider.enableProviderNamed',
              { name: provider.name },
            )}
            disabled={isPending}
            onValueChange={(value) => onToggle(provider, value)}
            testID={`provider-enabled-switch-${provider.id}`}
            value={isEnabled}
          />
          <View className="size-5 items-center justify-center">
            {isPending ? (
              <Spinner accessibilityLabel={t('settings.provider.status.updating')} size="sm" />
            ) : (
              <ChevronRightIcon className="size-5 text-muted-foreground" />
            )}
          </View>
        </View>
      }
    />
  );
});
