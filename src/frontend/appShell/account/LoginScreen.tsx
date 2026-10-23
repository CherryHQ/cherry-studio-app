import { Button, Image, Input, TextField, useToast } from '@cherrystudio/ui/components';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, type TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountError, type AccountErrorCode } from '@/shared/contracts/account';

import { useAccount } from './useAccount';

const APP_LOGO = require('@/assets/cherry-studio-logo.png');

export const ACCOUNT_ERROR_KEYS = {
  unavailable: 'account.error.unavailable',
  address: 'account.error.address',
  connection: 'account.error.connection',
  credentials: 'account.error.credentials',
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
 * Cloud sign-in opens Accounts Portal; private deployments use their own password endpoint.
 */
export function LoginScreen({ expired, onSignedIn, secondaryAction }: LoginScreenProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { account, state } = useAccount();
  const [isPrivate, setIsPrivate] = useState(
    !state.isCloudSignInAvailable || Boolean(state.privateAddress),
  );
  const [address, setAddress] = useState(state.privateAddress ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const usernameInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const canSignIn =
    !state.isBusy &&
    (isPrivate
      ? Boolean(address.trim() && username.trim() && password)
      : state.isCloudSignInAvailable);

  const signIn = () => {
    if (!canSignIn) return;
    void account
      .signIn(isPrivate ? { address, username, password } : undefined)
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
        automaticallyAdjustKeyboardInsets
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
              {t(
                expired
                  ? 'account.login.expiredDescription'
                  : isPrivate
                    ? 'account.login.privateDescription'
                    : 'account.login.description',
              )}
            </Text>
          </View>
        </View>
        <View className="gap-3 px-6">
          {isPrivate ? (
            <View className="gap-3">
              <TextField disabled={state.isBusy}>
                <TextField.Label>{t('account.address')}</TextField.Label>
                <Input
                  accessibilityLabel={t('account.address')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  onChangeText={setAddress}
                  onSubmitEditing={() => usernameInput.current?.focus()}
                  returnKeyType="next"
                  submitBehavior="submit"
                  value={address}
                />
                <TextField.Description>{t('account.addressHint')}</TextField.Description>
              </TextField>
              <TextField disabled={state.isBusy}>
                <TextField.Label>{t('account.username')}</TextField.Label>
                <Input
                  accessibilityLabel={t('account.username')}
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect={false}
                  onChangeText={setUsername}
                  onSubmitEditing={() => passwordInput.current?.focus()}
                  ref={usernameInput}
                  returnKeyType="next"
                  submitBehavior="submit"
                  textContentType="username"
                  value={username}
                />
              </TextField>
              <TextField disabled={state.isBusy}>
                <TextField.Label>{t('account.password')}</TextField.Label>
                <Input
                  accessibilityLabel={t('account.password')}
                  autoComplete="current-password"
                  onChangeText={setPassword}
                  onSubmitEditing={signIn}
                  ref={passwordInput}
                  returnKeyType="go"
                  textContentType="password"
                  type="password"
                  value={password}
                  visibilityAccessibilityLabels={{
                    hide: t('account.hidePassword'),
                    show: t('account.showPassword'),
                  }}
                />
              </TextField>
            </View>
          ) : null}
          <Button disabled={!canSignIn} loading={state.isBusy} onPress={signIn} size="lg">
            {t('account.login.signIn')}
          </Button>
          <View className="min-h-12 flex-row items-center justify-center gap-2">
            {state.isCloudSignInAvailable ? (
              <Button
                disabled={state.isBusy}
                onPress={() => {
                  setPassword('');
                  setIsPrivate((value) => !value);
                }}
                size="xs"
                variant="ghost"
              >
                {t(isPrivate ? 'account.login.cloud' : 'account.login.private')}
              </Button>
            ) : null}
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
