import XIcon from '@cherrystudio/app-icons/icons/x';
import { Button, Image, Input, TextField, useToast } from '@cherrystudio/ui/components';
import { loggerService } from '@logger';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, type TextInputInstance, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountError, type AccountErrorCode } from '@/shared/contracts/account';

import { organizationLabel } from './organizationLabel';
import { useAccount } from './useAccount';

const APP_LOGO = require('@/assets/cherry-studio-logo.png');
const logger = loggerService.withContext('LoginScreen');

export const ACCOUNT_ERROR_KEYS = {
  unavailable: 'account.error.unavailable',
  address: 'account.error.address',
  connection: 'account.error.connection',
  credentials: 'account.error.credentials',
  failed: 'account.error.failed',
  response: 'account.error.response',
  rejected: 'account.error.rejected',
} as const satisfies Record<AccountErrorCode, string>;

/**
 * `first-use` may be skipped; `sign-in` and `switch` open from the profile and close back to it;
 * `expired` replaces an organization whose session was refused and offers sign-out instead.
 */
export type LoginPurpose = 'first-use' | 'sign-in' | 'switch' | 'expired';

type LoginScreenProps = {
  purpose: LoginPurpose;
  /** Leaves without signing in: skips on first use, closes from the profile, signs out when expired. */
  onLeave: () => void;
  /** Called when sign-in keeps the app in place; another organization reloads it instead. */
  onSignedIn?: () => void;
};

/** Cloud sign-in opens Accounts Portal; private deployments use their own password endpoint. */
export function LoginScreen({ onLeave, onSignedIn, purpose }: LoginScreenProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { account, state } = useAccount();
  const isExpired = purpose === 'expired';
  // An expired private session signs in again to the same server and, when known, the same user.
  const lockedAddress = isExpired ? state.privateAddress : undefined;
  const lockedUsername = lockedAddress ? state.privateUsername : undefined;
  // The method page opens on the Cherry Studio account; the private form keeps the last address.
  const [isPrivate, setIsPrivate] = useState(Boolean(lockedAddress));
  const [address, setAddress] = useState(state.privateAddress ?? '');
  const [username, setUsername] = useState(lockedUsername ?? '');
  const [password, setPassword] = useState('');
  const usernameInput = useRef<TextInputInstance>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const canSignIn =
    !state.isBusy && (!isPrivate || Boolean(address.trim() && username.trim() && password));
  const organization = organizationLabel(state);

  const signIn = () => {
    if (!canSignIn) return;
    void account
      .signIn(isPrivate ? { address, username, password } : undefined)
      .then((signedIn) => {
        if (signedIn) onSignedIn?.();
      })
      .catch((error: unknown) => {
        logger.error('Sign-in failed', error as Error, { operation: 'account.signIn' });
        const code = error instanceof AccountError ? error.code : 'failed';
        toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
      });
  };

  const title = isExpired
    ? t('account.login.expiredTitle')
    : isPrivate
      ? t('account.login.private')
      : purpose === 'switch'
        ? t('account.switch')
        : t('account.login.title');
  const description = isExpired
    ? lockedUsername
      ? t('account.login.expiredPrivateDescription')
      : organization?.kind === 'organization'
        ? t('account.login.expiredOrganizationDescription', { organization: organization.label })
        : t('account.login.expiredDescription')
    : isPrivate
      ? t('account.login.privateDescription')
      : purpose === 'switch'
        ? t('account.login.switchDescription')
        : t('account.login.description');

  return (
    <View
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      {purpose === 'sign-in' || purpose === 'switch' ? (
        <View className="flex-row px-4 py-2">
          <Button
            accessibilityLabel={t('common.close')}
            disabled={state.isBusy}
            icon={<XIcon />}
            onPress={onLeave}
            shape="pill"
            variant="tonal"
          />
        </View>
      ) : null}
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerClassName="flex-grow justify-between gap-8 pb-4"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-grow items-center justify-center gap-5 px-8 py-12">
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
              {title}
            </Text>
            <Text className="text-center text-base text-muted-foreground">{description}</Text>
          </View>
        </View>
        <View className="gap-4 px-6">
          {isPrivate ? (
            <View className="gap-4">
              <TextField disabled={state.isBusy || Boolean(lockedAddress)}>
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
              </TextField>
              <TextField disabled={state.isBusy || Boolean(lockedUsername)}>
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
          <View className="gap-2">
            <Button disabled={!canSignIn} loading={state.isBusy} onPress={signIn} size="lg">
              {t(isExpired ? 'account.login.reSignIn' : 'account.login.signIn')}
            </Button>
            {!isExpired ? (
              <Button
                disabled={state.isBusy}
                onPress={() => {
                  setPassword('');
                  setIsPrivate((value) => !value);
                }}
                variant="ghost"
              >
                {t(isPrivate ? 'account.login.cloud' : 'account.login.private')}
              </Button>
            ) : null}
            {purpose === 'first-use' || isExpired ? (
              <Button disabled={state.isBusy} onPress={onLeave} variant="ghost">
                {t(isExpired ? 'account.signOut' : 'account.login.skip')}
              </Button>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
