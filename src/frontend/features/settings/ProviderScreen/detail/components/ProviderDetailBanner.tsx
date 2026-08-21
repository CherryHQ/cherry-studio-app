import { Switch } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Provider } from '@/shared/data/types/provider';

import { ProviderAvatar } from '../../../components/ProviderAvatar';

const bannerAvatarSize = 34;

/**
 * Who the configuration below is about, and whether the provider is on. One
 * component on both platforms — the enabled state used to be a play/pause
 * button in the bottom bar, which was a native toolbar on iOS and a drawn pill
 * on Android, and read as an action rather than as the state it is.
 *
 * The models tab leaves it out: that tab is a list of rows shaped exactly like
 * this one, where a provider row with a switch reads as a model's own.
 */
export function ProviderDetailBanner({
  isActive,
  isDisabled,
  onToggleActive,
  provider,
  providerId,
  providerName,
}: {
  isActive: boolean;
  isDisabled: boolean;
  onToggleActive: () => void;
  provider?: Provider;
  /** From the route, so the logo resolves before the record lands. */
  providerId: string;
  /** From the route as well, naming the provider until the record lands. */
  providerName?: string;
}) {
  const { t } = useTranslation();
  const name = provider?.name ?? providerName ?? '';

  return (
    // Same 20pt rhythm and 16pt gutter as the fields below it: with no rule
    // under it, the banner is one more block on the page rather than chrome.
    <View className="flex-row items-center gap-3 px-4 py-5">
      <ProviderAvatar
        presetProviderId={provider?.presetProviderId}
        providerId={providerId}
        providerName={name}
        size={bannerAvatarSize}
      />
      <Text className="min-w-0 flex-1 font-medium text-base text-foreground" numberOfLines={1}>
        {name}
      </Text>
      <Switch
        accessibilityLabel={t(
          isActive ? 'settings.provider.disableProvider' : 'settings.provider.enableProvider',
        )}
        disabled={isDisabled}
        onValueChange={onToggleActive}
        value={isActive}
      />
    </View>
  );
}
