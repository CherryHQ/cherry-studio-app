import { Button, Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { ProviderAccountCapabilities } from '@/shared/contracts/providerAccounts';

import { useProviderAccount } from './useProviderAccount';

export function ProviderAccountPanel({
  providerId,
  providerName,
  capabilities,
  changesDisabled,
  onKeysChanged,
  onBusyChange,
}: {
  providerId: string;
  providerName: string;
  capabilities: ProviderAccountCapabilities;
  changesDisabled: boolean;
  onKeysChanged: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const account = useProviderAccount(providerId, onKeysChanged, onBusyChange);
  const status = account.status.data;
  return (
    <View className="gap-3 rounded-2xl bg-card p-4">
      <Text className="text-base font-semibold text-foreground">
        {t('settings.provider.account.title', { name: providerName })}
      </Text>
      {account.status.isPending ? (
        <Spinner />
      ) : status?.signedIn ? (
        <>
          {status.displayName || status.email ? (
            <Text className="text-sm text-foreground">{status.displayName ?? status.email}</Text>
          ) : null}
          {capabilities.balance ? (
            <>
              <Text className="text-sm text-muted-foreground">
                {t('settings.provider.account.balance')}
              </Text>
              <Text className="text-2xl font-semibold tabular-nums text-foreground">
                {status.balance === null
                  ? '—'
                  : new Intl.NumberFormat(i18n.language, {
                      style: 'currency',
                      currency: status.balance.currency,
                    }).format(status.balance.amount)}
              </Text>
            </>
          ) : null}
          {capabilities.topUp || capabilities.balance ? (
            <View className="flex-row gap-3">
              {capabilities.topUp ? (
                <View className="flex-1">
                  <Button
                    disabled={account.busy}
                    onPress={() => void account.topUp()}
                    variant="secondary"
                  >
                    {t('settings.provider.account.topUp')}
                  </Button>
                </View>
              ) : null}
              {capabilities.balance ? (
                <View className="flex-1">
                  <Button
                    disabled={account.busy || account.refreshing}
                    loading={account.refreshing}
                    onPress={() => void account.refresh()}
                    variant="secondary"
                  >
                    {t('settings.provider.account.refresh')}
                  </Button>
                </View>
              ) : null}
            </View>
          ) : null}
          {capabilities.topUp && capabilities.balance ? (
            <Text className="text-sm text-muted-foreground">
              {t('settings.provider.account.topUpHint')}
            </Text>
          ) : null}
          <Button
            disabled={changesDisabled || account.busy}
            loading={account.busy}
            onPress={() => void account.logout()}
            variant="ghost"
          >
            {t('settings.provider.account.logout')}
          </Button>
        </>
      ) : (
        <>
          <Text className="text-sm text-muted-foreground">
            {t(
              capabilities.apiKeys
                ? 'settings.provider.account.keyAccountHint'
                : 'settings.provider.account.signInHint',
            )}
          </Text>
          <Button
            disabled={changesDisabled || account.busy || account.status.isPending}
            loading={account.busy}
            onPress={() => void account.login()}
          >
            {t('settings.provider.account.login', { name: providerName })}
          </Button>
        </>
      )}
      {changesDisabled && !account.busy ? (
        <Text className="text-sm text-muted-foreground">
          {t('settings.provider.account.saveFirst')}
        </Text>
      ) : null}
      {account.error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {t(`settings.provider.account.errors.${account.error}`)}
        </Text>
      ) : null}
    </View>
  );
}
