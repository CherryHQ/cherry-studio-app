import { Button } from '@cherrystudio/ui/components';
import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { AccountSignInFields, useAccount, useAccountSignInForm } from '@/frontend/appShell/account';

import { OnboardingButton, OnboardingPage } from '../components/OnboardingPage';
import type { OnboardingProgress } from './useOnboardingProgress';

export function AccountOnboardingStep({ progress }: { progress: OnboardingProgress }) {
  const { t } = useTranslation();
  const { account, state } = useAccount();
  const form = useAccountSignInForm({ isBusy: progress.isSaving, returnTo: '/onboarding' });
  const { isPrivate, isBusy: busy } = form;
  const restored = state.isSignedIn || state.isEnterprise;
  const continueRestored = useEffectEvent(() => {
    void progress.advance('completed');
  });
  useEffect(() => {
    if (restored && progress.isFocused && !busy && !progress.saveFailed) continueRestored();
  }, [restored, progress.isFocused, busy, progress.saveFailed]);

  const signIn = async () => {
    if (await form.signIn()) await progress.advance('completed');
  };
  return (
    <OnboardingPage
      description={t(isPrivate ? 'account.login.privateDescription' : 'account.login.description')}
      footer={
        restored ? (
          <OnboardingButton
            loading={progress.isSaving}
            onPress={() => void progress.advance('completed')}
          >
            {t('onboarding.continue')}
          </OnboardingButton>
        ) : (
          <>
            <OnboardingButton
              disabled={restored || !form.canSignIn}
              loading={busy}
              onPress={() => void signIn()}
              testID="onboarding-sign-in"
            >
              {t('account.login.signIn')}
            </OnboardingButton>
            <OnboardingButton
              disabled={busy || restored}
              onPress={form.switchMethod}
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
          <Button
            disabled={busy}
            onPress={() => {
              account.dismissPrompt();
              void progress.advance('pending');
            }}
            size="sm"
            variant="ghost"
            testID="onboarding-skip-login"
          >
            {t('account.login.skip')}
          </Button>
        ) : undefined
      }
      onBack={busy || restored ? undefined : () => void progress.advance('notifications')}
      step={{ current: 4, total: 4, label: t('onboarding.preparation.step', { current: 4 }) }}
      testID="onboarding-account"
      title={t(isPrivate ? 'account.login.private' : 'onboarding.account.title')}
    >
      {isPrivate ? (
        <AccountSignInFields form={form} onSubmit={() => void signIn()} />
      ) : (
        <Text className="text-sm text-muted-foreground">{t('onboarding.account.sdkHint')}</Text>
      )}
    </OnboardingPage>
  );
}
