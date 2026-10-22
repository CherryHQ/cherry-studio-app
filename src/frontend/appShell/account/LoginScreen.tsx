import { Button, Image, Input, TextField, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountError, type AccountErrorCode } from '@/shared/contracts/account';

import { useAccount } from './useAccount';

const APP_LOGO = require('@/assets/cherry-studio-logo.png');

export const ACCOUNT_ERROR_KEYS = {
  unavailable: 'account.error.unavailable',
  address: 'account.error.address',
  connection: 'account.error.connection',
  rejected: 'account.error.rejected',
} as const satisfies Record<AccountErrorCode, string>;

type LoginScreenProps = {
  /** Shown when the enterprise server stopped accepting the session. */
  expired?: boolean;
  /** Called after a community sign-in; enterprise sign-in reloads into its profile instead. */
  onSignedIn?: () => void;
  secondaryAction?: { label: string; onPress: () => void };
};

/**
 * Accounts Portal sign-in in the external browser. The portal chooses between the community
 * account and an organization; a private deployment supplies its own server address.
 */
export function LoginScreen({ expired, onSignedIn, secondaryAction }: LoginScreenProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { account, state } = useAccount();
  const [isPrivate, setIsPrivate] = useState(false);
  const [address, setAddress] = useState('');

  const signIn = () => {
    void account
      .signIn(isPrivate ? { address } : {})
      .then((signedIn) => {
        if (signedIn) onSignedIn?.();
      })
      .catch((error: unknown) => {
        const code = error instanceof AccountError ? error.code : 'connection';
        toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
      });
  };

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-between gap-8 pb-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-grow items-center justify-center gap-6 px-8 py-12">
          <Image
            accessibilityIgnoresInvertColors
            className="size-20 rounded-2xl"
            source={APP_LOGO}
          />
          <View className="items-center gap-3">
            <Text
              accessibilityRole="header"
              className="text-center font-semibold text-3xl text-foreground"
            >
              {t(expired ? 'account.login.expiredTitle' : 'account.login.title')}
            </Text>
            <Text className="text-center text-base text-muted-foreground">
              {t(expired ? 'account.login.expiredDescription' : 'account.login.description')}
            </Text>
          </View>
        </View>
        <View className="gap-3 px-6">
          {isPrivate ? (
            <TextField disabled={state.isBusy}>
              <TextField.Label>{t('account.address')}</TextField.Label>
              <Input
                accessibilityLabel={t('account.address')}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onChangeText={setAddress}
                onSubmitEditing={signIn}
                returnKeyType="go"
                value={address}
              />
              <TextField.Description>{t('account.addressHint')}</TextField.Description>
            </TextField>
          ) : null}
          <Button
            disabled={!state.isAvailable || state.isBusy || (isPrivate && !address.trim())}
            loading={state.isBusy}
            onPress={signIn}
            size="lg"
          >
            {t('account.login.signIn')}
          </Button>
          {state.isAvailable ? null : (
            <Text className="text-center text-sm text-muted-foreground">
              {t('account.error.unavailable')}
            </Text>
          )}
          <View className="min-h-12 flex-row items-center justify-center gap-2">
            <Button
              disabled={state.isBusy}
              onPress={() => setIsPrivate((value) => !value)}
              size="xs"
              variant="ghost"
            >
              {t(isPrivate ? 'account.login.cloud' : 'account.login.private')}
            </Button>
            {secondaryAction ? (
              <Button
                disabled={state.isBusy}
                onPress={secondaryAction.onPress}
                size="xs"
                variant="ghost"
              >
                {secondaryAction.label}
              </Button>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
