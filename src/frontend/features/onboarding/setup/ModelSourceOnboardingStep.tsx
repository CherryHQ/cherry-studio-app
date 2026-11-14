import { Redirect, useRouter } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAccount } from '@/frontend/appShell/account';
import { useQuery } from '@/frontend/data';
import { useCloud } from '@/frontend/hooks/useCloud';
import { editionCapabilities } from '@/shared/data/managedPolicy';

import {
  OnboardingButton,
  OnboardingMessage,
  OnboardingOption,
  OnboardingPage,
} from '../components/OnboardingPage';
import { getOnboardingDestination } from './onboardingDestination';
import type { OnboardingProgress } from './useOnboardingProgress';

export function ModelSourceOnboardingStep({ progress }: { progress: OnboardingProgress }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { state: account } = useAccount();
  const { cloud, state } = useCloud();
  const organizationManaged = !editionCapabilities().providerOnboarding;
  const models = useQuery('/models', {
    enabled: account.hasPrompted && !organizationManaged,
    query: { enabled: true, isSystemSupported: true },
    retry: false,
  });
  const destination = getOnboardingDestination({
    account,
    cloud: state,
    organizationManaged,
    models: {
      hasModels: (models.data?.length ?? 0) > 0,
      isLoading: models.isPending,
      isError: models.isError,
    },
  });
  const finish = async () => {
    if (destination === 'permissions') await progress.advance('permissions');
    else if (destination === 'completed' && (await progress.advance('completed')))
      router.replace('/');
  };
  const continueRestored = useEffectEvent(finish);
  useEffect(() => {
    if (
      (destination === 'completed' || destination === 'permissions') &&
      !progress.isSaving &&
      !progress.saveFailed
    )
      void continueRestored();
  }, [destination, progress.isSaving, progress.saveFailed]);
  if (!progress.isSaving) {
    if (destination === 'subscription') return <Redirect href="/onboarding/subscription" />;
    if (destination === 'model') return <Redirect href="/onboarding/model" />;
  }
  const waiting =
    destination === 'loading' || destination === 'completed' || destination === 'permissions';
  const failed = destination === 'retry' || progress.saveFailed;

  return (
    <OnboardingPage
      description={t('onboarding.welcome.description')}
      footer={
        <>
          {failed ? (
            <OnboardingButton
              disabled={progress.isSaving}
              onPress={() => {
                if (waiting) {
                  void finish();
                  return;
                }
                void models.refetch();
                void cloud.refresh().catch(() => {});
              }}
            >
              {t('common.retry')}
            </OnboardingButton>
          ) : null}
          {destination !== 'permissions' && destination !== 'completed' ? (
            <OnboardingButton
              loading={progress.isSaving}
              onPress={() => void progress.skip()}
              testID="onboarding-model-source-skip"
              variant="text"
            >
              {t('onboarding.skip')}
            </OnboardingButton>
          ) : null}
        </>
      }
      testID="onboarding-model-source"
      title={t('onboarding.source.title')}
    >
      {waiting && !failed ? (
        <OnboardingMessage loading>{t('onboarding.loading')}</OnboardingMessage>
      ) : failed ? (
        <OnboardingMessage>{t('settings.provider.models.management.loadFailed')}</OnboardingMessage>
      ) : (
        <View className="gap-4">
          <OnboardingOption
            description={t('onboarding.source.providerDescription')}
            disabled={progress.isSaving}
            onPress={() => router.replace('/onboarding/provider')}
            testID="onboarding-connect"
            title={t('onboarding.welcome.connect')}
          />
          <OnboardingOption
            description={t('onboarding.source.desktopDescription')}
            disabled={progress.isSaving}
            onPress={() => router.replace('/onboarding/device-connections')}
            testID="onboarding-desktop-sync"
            title={t('onboarding.welcome.desktopSync')}
          />
        </View>
      )}
    </OnboardingPage>
  );
}
