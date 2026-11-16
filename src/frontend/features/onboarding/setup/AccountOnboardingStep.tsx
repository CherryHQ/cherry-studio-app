import { useToast } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { ACCOUNT_ERROR_KEYS, useAccount } from '@/frontend/appShell/account';
import { AccountError } from '@/shared/contracts/account';

import { OnboardingButton, OnboardingField, OnboardingPage } from '../components/OnboardingPage';
import type { OnboardingProgress } from './useOnboardingProgress';

export function AccountOnboardingStep({ progress }: { progress: OnboardingProgress }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { account, state } = useAccount();
  const [isPrivate, setIsPrivate] = useState(false);
  const [address, setAddress] = useState(state.privateAddress ?? '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const busy = progress.isSaving || state.isBusy;
  const restored = state.isSignedIn || state.isEnterprise;
  const continueRestored = useEffectEvent(() => {
    void progress.advance('pending');
  });
  useEffect(() => {
    if (restored && !progress.isSaving && !state.isBusy && !progress.saveFailed) continueRestored();
  }, [restored, progress.isSaving, progress.saveFailed, state.isBusy]);

  const signIn = async () => {
    if (busy) return;
    try {
      const signedIn = await account.signIn(
        isPrivate ? { address, username, password } : undefined,
      );
      if (signedIn) await progress.advance('pending');
    } catch (error) {
      const code = error instanceof AccountError ? error.code : 'failed';
      toast.show({ label: t(ACCOUNT_ERROR_KEYS[code]), variant: 'danger' });
    }
  };
  return (
    <OnboardingPage
      description={t(isPrivate ? 'account.login.privateDescription' : 'account.login.description')}
      footer={
        restored ? (
          <OnboardingButton
            loading={progress.isSaving}
            onPress={() => void progress.advance('pending')}
          >
            {t('onboarding.continue')}
          </OnboardingButton>
        ) : (
          <>
            <OnboardingButton
              disabled={restored || (isPrivate && !(address.trim() && username.trim() && password))}
              loading={busy}
              onPress={() => void signIn()}
              testID="onboarding-sign-in"
            >
              {t('account.login.signIn')}
            </OnboardingButton>
            <OnboardingButton
              disabled={busy || restored}
              onPress={() => {
                setPassword('');
                setIsPrivate((current) => !current);
              }}
              testID="onboarding-private-login"
              variant="secondary"
            >
              {t(isPrivate ? 'account.login.cloud' : 'account.login.private')}
            </OnboardingButton>
          </>
        )
      }
      headerAction={
        !restored ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            className={cn('min-h-12 justify-center pl-5 active:opacity-70', busy && 'opacity-40')}
            disabled={busy}
            onPress={() => {
              account.dismissPrompt();
              void progress.advance('pending');
            }}
            testID="onboarding-skip-login"
          >
            <Text className="text-right text-sm text-muted-foreground">
              {t('account.login.skip')}
            </Text>
          </Pressable>
        ) : undefined
      }
      onBack={busy || restored ? undefined : () => void progress.advance('notifications')}
      step={{ current: 4, total: 4, label: t('onboarding.preparation.step', { current: 4 }) }}
      testID="onboarding-account"
      title={t(isPrivate ? 'account.login.private' : 'onboarding.account.title')}
    >
      {isPrivate ? (
        <View className="gap-5">
          <OnboardingField
            editable={!busy}
            keyboardType="url"
            label={t('account.address')}
            onChangeText={setAddress}
            value={address}
          />
          <OnboardingField
            autoComplete="username"
            editable={!busy}
            label={t('account.username')}
            onChangeText={setUsername}
            textContentType="username"
            value={username}
          />
          <OnboardingField
            autoComplete="current-password"
            editable={!busy}
            label={t('account.password')}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            value={password}
          />
        </View>
      ) : (
        <Text className="text-sm text-muted-foreground">{t('onboarding.account.sdkHint')}</Text>
      )}
    </OnboardingPage>
  );
}
