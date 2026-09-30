import CopyIcon from '@cherrystudio/app-icons/icons/copy';
import RefreshCwIcon from '@cherrystudio/app-icons/icons/refresh-cw';
import { Button, Section, Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ProviderSignInPromptRow } from '../../ProviderAccount/ProviderSignInPromptRow';
import { useProviderAccount } from '../../ProviderAccount/useProviderAccount';
import type { ProviderConfigurationAccount } from '../types';

/**
 * Signing in to the provider's account, shown as rows like the rest of the page. Signed
 * in, it names the account and its balance; signed out, one row starts the login.
 */
export function ProviderAccountSection({
  account,
  providerId,
  providerName,
}: {
  account: ProviderConfigurationAccount;
  providerId: string;
  providerName: string;
}) {
  const { t, i18n } = useTranslation();
  const interactive = account.capabilities.flow === 'interactive';
  const state = useProviderAccount(
    providerId,
    account.onKeysChanged,
    account.onBusyChange,
    interactive,
  );
  const status = state.status.data;
  const busyIndicator = state.busy ? (
    <Spinner accessibilityLabel={t('settings.provider.loading')} size="sm" />
  ) : undefined;

  return (
    <Section
      footer={state.error ? t(`settings.provider.account.errors.${state.error}`) : undefined}
      title={t('settings.provider.config.account')}
    >
      {state.status.isPending ? (
        <Section.Item
          label={t('settings.provider.account.title', { name: providerName })}
          trailing={<Spinner accessibilityLabel={t('settings.provider.loading')} size="sm" />}
        />
      ) : status?.signedIn ? (
        <>
          <Section.Item
            label={status.displayName ?? status.email ?? providerName}
            trailing={
              account.capabilities.balance ? (
                <View className="flex-row items-center gap-1">
                  <Text className="text-base tabular-nums text-muted-foreground">
                    {status.balance === null
                      ? '—'
                      : new Intl.NumberFormat(i18n.language, {
                          currency: status.balance.currency,
                          style: 'currency',
                        }).format(status.balance.amount)}
                  </Text>
                  <Button
                    accessibilityLabel={t('settings.provider.account.refresh')}
                    disabled={state.busy || state.refreshing}
                    icon={<RefreshCwIcon />}
                    loading={state.refreshing}
                    onPress={() => void state.refresh()}
                    size="sm"
                    variant="ghost"
                  />
                </View>
              ) : undefined
            }
          />
          <Section.Item
            disabled={state.busy}
            label={t('settings.provider.account.logout')}
            onPress={() => void state.logout()}
            showChevron={false}
            trailing={busyIndicator}
          />
          {interactive ? (
            <Section.Item
              disabled={state.busy}
              label={t('settings.provider.account.login', { name: providerName })}
              onPress={() => void state.login()}
            />
          ) : null}
        </>
      ) : (
        <Section.Item
          description={t(
            account.capabilities.apiKeys
              ? 'settings.provider.config.accountKeysHint'
              : 'settings.provider.account.signInHint',
          )}
          disabled={state.busy}
          label={t('settings.provider.account.login', { name: providerName })}
          onPress={() => void state.login()}
          testID="provider-account-login"
          trailing={busyIndicator}
        />
      )}
      {state.loginEvent?.type === 'device-code' ? (
        <Section.Item
          label={t('settings.provider.account.deviceCode')}
          description={t('settings.provider.account.deviceCodeHint')}
          trailing={
            <View className="flex-row items-center gap-1">
              <Text selectable className="text-base font-semibold text-foreground">
                {state.loginEvent.code}
              </Text>
              <Button
                accessibilityLabel={t('common.copy')}
                icon={<CopyIcon />}
                onPress={() => void state.copyLoginCode()}
                size="sm"
                variant="ghost"
              />
            </View>
          }
        />
      ) : null}
      {state.loginEvent?.type === 'device-code' || state.loginEvent?.type === 'browser' ? (
        <Section.Item
          label={t('settings.provider.account.openBrowser')}
          onPress={() => void state.openLoginBrowser()}
        />
      ) : null}
      {state.loginPrompt ? (
        <ProviderSignInPromptRow
          key={state.loginPrompt.type}
          prompt={state.loginPrompt}
          onAnswer={state.answerPrompt}
        />
      ) : null}
      {state.loginEvent && interactive ? (
        <Section.Item label={t('common.cancel')} onPress={state.cancelLogin} showChevron={false} />
      ) : null}
    </Section>
  );
}
