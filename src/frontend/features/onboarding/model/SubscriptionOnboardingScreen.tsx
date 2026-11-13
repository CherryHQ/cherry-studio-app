import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference, useQuery } from '@/frontend/data';
import { useCloud } from '@/frontend/hooks/useCloud';
import { hasActiveCloudSubscription } from '@/shared/contracts/cloud';

import { OnboardingButton, OnboardingMessage, OnboardingPage } from '../components/OnboardingPage';
import { OnboardingModelList } from './OnboardingModelList';
import { getOnboardingSubscriptionModels } from './onboardingModels';
import { useCompleteOnboarding } from './useCompleteOnboarding';

/** Account models need no provider configuration; the user still chooses their default. */
export function SubscriptionOnboardingScreen() {
  const { t } = useTranslation();
  const { cloud, state } = useCloud();
  const [defaultModelId] = usePreference('agent.default_model_id');
  const models = useQuery('/models', {
    query: { enabled: true, isSystemSupported: true },
    retry: false,
  });
  const { complete, isSaving: isBusy, cancel } = useCompleteOnboarding();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const candidates = getOnboardingSubscriptionModels(state, models.data ?? []);
  const selected =
    candidates.find((model) => model.id === (selectedId ?? defaultModelId)) ??
    (candidates.length === 1 ? candidates[0] : undefined);
  const loading =
    state.phase === 'loading' || state.isRefreshing || models.isFetching || models.isPending;
  const failed = state.phase === 'error' || models.isError;
  const retry = () => void Promise.allSettled([cloud.refresh(), models.refetch()]);
  const finish = () => {
    if (isBusy || loading || failed || !selected) return;
    // The account may change while a selection is on screen. Recheck its owner at the click.
    if (!getOnboardingSubscriptionModels(cloud.getState(), [selected]).length) {
      retry();
      return;
    }
    void complete({ kind: 'subscription', model: selected });
  };

  if (
    state.phase === 'signed_out' ||
    (state.phase === 'ready' && !state.isRefreshing && !hasActiveCloudSubscription(state))
  )
    return <Redirect href="/onboarding" />;

  return (
    <OnboardingPage
      description={t('onboarding.model.description')}
      footer={
        !loading && !failed && candidates.length > 0 ? (
          <>
            <OnboardingButton
              disabled={!selected}
              loading={isBusy}
              onPress={finish}
              testID="onboarding-model-start"
            >
              {t(isBusy ? 'onboarding.model.saving' : 'onboarding.model.continue')}
            </OnboardingButton>
            {isBusy ? (
              <OnboardingButton onPress={cancel} variant="text">
                {t('common.cancel')}
              </OnboardingButton>
            ) : null}
          </>
        ) : undefined
      }
      testID="onboarding-subscription-model"
      title={t('onboarding.model.title')}
      variant="list"
    >
      {loading ? (
        <OnboardingMessage loading>{t('onboarding.model.loading')}</OnboardingMessage>
      ) : failed || candidates.length === 0 ? (
        <>
          <OnboardingMessage>
            {t('settings.provider.models.management.loadFailed')}
          </OnboardingMessage>
          <OnboardingButton onPress={retry}>{t('common.retry')}</OnboardingButton>
        </>
      ) : (
        <OnboardingModelList
          disabled={isBusy}
          models={candidates}
          onSelect={(model) => setSelectedId(model.id)}
          selectedId={selected?.id}
        />
      )}
    </OnboardingPage>
  );
}
