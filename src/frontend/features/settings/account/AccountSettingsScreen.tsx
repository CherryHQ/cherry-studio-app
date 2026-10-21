import { Button, Input, Section, TextField, useToast } from '@cherrystudio/ui/components';
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { EnterpriseError, type EnterpriseErrorCode } from '@/shared/contracts/enterprise';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const ERROR_KEYS = {
  unavailable: 'enterprise.account.error.unavailable',
  address: 'enterprise.account.error.address',
  'unsupported-profile': 'enterprise.account.error.unsupportedProfile',
  connection: 'enterprise.account.error.connection',
  rejected: 'enterprise.account.error.rejected',
} as const satisfies Record<EnterpriseErrorCode, string>;

export function useEnterpriseAccount() {
  const enterprise = useBackendModule('enterprise');
  const state = useSyncExternalStore(
    enterprise.subscribe,
    enterprise.getState,
    enterprise.getState,
  );
  return { enterprise, state };
}

/** Sign-in, organization switching, local mode and the enterprise address. */
export default function AccountSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { enterprise, state } = useEnterpriseAccount();
  const [address, setAddress] = useState(state.address);
  const run = (action: () => Promise<void> | void) => {
    void Promise.resolve()
      .then(action)
      .catch((error: unknown) => {
        const code = error instanceof EnterpriseError ? error.code : 'connection';
        toast.show({ label: t(ERROR_KEYS[code]), variant: 'danger' });
      });
  };

  return (
    <SettingsScrollPage
      headerProps={{ title: t('enterprise.account.title') }}
      contentClassName="gap-6"
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text className="text-base text-foreground">
          {state.isEnterprise
            ? t('enterprise.account.enterprise', { name: state.name ?? '' })
            : t('enterprise.account.local')}
        </Text>
        {state.needsSignIn ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
            {t('enterprise.account.needsSignIn')}
          </Text>
        ) : null}
        {!state.isAvailable ? (
          <Text className="text-sm text-muted-foreground">{t(ERROR_KEYS.unavailable)}</Text>
        ) : null}
      </View>
      {state.isAvailable ? (
        <>
          {state.isEnterprise ? null : (
            <TextField disabled={state.isBusy}>
              <TextField.Label>{t('enterprise.account.address')}</TextField.Label>
              <Input
                accessibilityLabel={t('enterprise.account.address')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={setAddress}
                onEndEditing={() => {
                  if (address.trim() !== state.address) run(() => enterprise.setAddress(address));
                }}
                value={address}
              />
              <TextField.Description>{t('enterprise.account.addressHint')}</TextField.Description>
            </TextField>
          )}
          <View className="gap-3">
            <Button
              disabled={state.isBusy}
              onPress={() =>
                run(async () => {
                  if (!state.isEnterprise && address.trim() !== state.address)
                    enterprise.setAddress(address);
                  await enterprise.signIn();
                })
              }
            >
              {state.isEnterprise && !state.needsSignIn
                ? t('enterprise.account.switch')
                : t('enterprise.account.signIn')}
            </Button>
            {state.isEnterprise ? (
              <Section>
                <Section.Item
                  label={t('enterprise.account.useLocal')}
                  onPress={() => run(enterprise.useLocal)}
                />
                <Section.Item
                  label={t('enterprise.account.signOut')}
                  onPress={() => run(enterprise.signOut)}
                />
              </Section>
            ) : null}
          </View>
        </>
      ) : null}
    </SettingsScrollPage>
  );
}
