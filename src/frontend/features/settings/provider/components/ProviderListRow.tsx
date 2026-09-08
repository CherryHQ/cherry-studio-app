import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Section, Spinner, Switch } from '@cherrystudio/ui/components';
import { duration, easing } from '@cherrystudio/ui/motion';
import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { Provider } from '@/shared/data/types/provider';

import { ProviderAvatar } from './ProviderAvatar';

const providerStatusMotion = {
  duration: duration.fast,
  easing: easing.settle,
  reduceMotion: ReduceMotion.System,
} as const;

function ProviderEnabledStatus({ isEnabled }: { isEnabled: boolean }) {
  const { t } = useTranslation();
  const progress = useSharedValue(isEnabled ? 1 : 0);

  useEffect(() => {
    progress.set(withTiming(isEnabled ? 1 : 0, providerStatusMotion));
  }, [isEnabled, progress]);

  const enabledStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const disabledStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.get() }));

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.Text className="text-muted-foreground text-xs" style={disabledStyle}>
        {t('settings.provider.status.disabled')}
      </Animated.Text>
      <Animated.Text
        className="text-success-subtle-foreground text-xs"
        style={[StyleSheet.absoluteFill, enabledStyle]}
      >
        {t('settings.provider.status.enabled')}
      </Animated.Text>
    </View>
  );
}

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
      description={<ProviderEnabledStatus isEnabled={isEnabled} key={provider.id} />}
      label={
        <Text className="text-base text-foreground" numberOfLines={1}>
          {provider.name}
        </Text>
      }
      leading={
        <ProviderAvatar
          displayContext="provider-list"
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
