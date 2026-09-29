import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
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
    <View className="gap-4 rounded-2xl bg-card p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-base font-semibold text-foreground">
            {t('settings.provider.account.title', { name: providerName })}
          </Text>
          {status?.signedIn && (status.displayName || status.email) ? (
            <Text className="text-sm text-muted-foreground">
              {status.displayName ?? status.email}
            </Text>
          ) : null}
        </View>
        {status?.signedIn ? (
          <View className="max-w-[50%] shrink">
            <Button
              disabled={changesDisabled || account.busy}
              loading={account.busy}
              onPress={() => void account.logout()}
              size="sm"
              variant="ghost"
            >
              {t('settings.provider.account.logout')}
            </Button>
          </View>
        ) : null}
      </View>
      {account.status.isPending ? (
        <Spinner accessibilityLabel={t('settings.provider.loading')} />
      ) : status?.signedIn ? (
        capabilities.balance ? (
          <View className="flex-row items-center gap-3">
            <View className="min-w-0 flex-1 gap-1">
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
            </View>
            <Button
              accessibilityLabel={t('settings.provider.account.refresh')}
              disabled={account.busy || account.refreshing}
              icon={<RefreshCwIcon />}
              loading={account.refreshing}
              onPress={() => void account.refresh()}
              variant="ghost"
            />
          </View>
        ) : null
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
