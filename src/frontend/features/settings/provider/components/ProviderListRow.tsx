import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Section, Spinner, Switch } from '@cherrystudio/ui/components';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ProviderAvatar } from '@/frontend/components/Avatar';
import { withPolicy } from '@/frontend/components/Policy';
import { useBackendModule } from '@/frontend/data';
import type { Provider } from '@/shared/data/types/provider';

import { ProviderAccountBadge } from './ProviderAccountBadge';

const ProviderListRowView = memo(function ProviderListRow({
  canSignIn = true,
  isEnabled,
  isPending,
  onOpen,
  onToggle,
  provider,
}: {
  /** Offers the provider's account sign-in where it has one. */
  canSignIn?: boolean;
  isEnabled: boolean;
  isPending: boolean;
  onOpen: (provider: Provider) => void;
  onToggle: (provider: Provider, isEnabled: boolean) => void;
  provider: Provider;
}) {
  const { t } = useTranslation();
  const accounts = useBackendModule('providers').accounts;
  const supportsSignIn = canSignIn && accounts.getCapabilities(provider).signIn;
  const statusLabel = t(
    isEnabled ? 'settings.provider.status.enabled' : 'settings.provider.status.disabled',
  );

  return (
    <Section.Item
      accessibilityLabel={[
        provider.name,
        statusLabel,
        supportsSignIn ? t('settings.provider.account.signInSupported') : undefined,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{ busy: isPending }}
      label={
        <View className="min-w-0 flex-row items-center gap-2">
          <Text className="min-w-0 shrink text-base text-foreground" numberOfLines={1}>
            {provider.name}
          </Text>
          {supportsSignIn ? <ProviderAccountBadge /> : null}
        </View>
      }
      // Opening the details only reads them, so the row stays live inside a locked group.
      locked={false}
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

/** Organization providers have no account to sign in to; their switch renders locked. */
export const ProviderListRow = withPolicy(ProviderListRowView, (policy) =>
  policy.canEdit('provider') ? {} : { canSignIn: false },
);
