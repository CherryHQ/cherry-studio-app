import { Redirect } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference, useQuery } from '@/frontend/data';
import { useCloud } from '@/frontend/hooks/useCloud';
import {
  CLOUD_PROVIDER_ID,
  cloudModelUnavailable,
  hasActiveCloudSubscription,
} from '@/shared/contracts/cloud';

import { OnboardingButton, OnboardingMessage, OnboardingPage } from '../components/OnboardingPage';
import { useCompleteOnboarding } from './useCompleteOnboarding';

/** Reuse the account catalog and seeded Agent without displaying model configuration. */
export function SubscriptionOnboardingScreen() {
  const { t } = useTranslation();
  const { cloud, state } = useCloud();
  const [defaultModelId] = usePreference('agent.default_model_id');
  const models = useQuery('/models', {
    query: { enabled: true, isSystemSupported: true },
    retry: false,
  });
  const { complete, cancel } = useCompleteOnboarding();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const subscribed = hasActiveCloudSubscription(state);
  const candidates = subscribed
    ? (models.data ?? []).filter((model) => {
        if (model.providerId !== CLOUD_PROVIDER_ID) return false;
        const reason = cloudModelUnavailable(state, model.modelId, 'agent');
        return reason === undefined || reason === 'quota_exhausted';
      })
    : [];
  const selected =
    candidates.find((model) => model.id === defaultModelId) ??
    candidates.find(
      (model) => cloudModelUnavailable(state, model.modelId, 'agent') === undefined,
    ) ??
    candidates[0];
  const selectedId = selected?.id;
  const preparingCatalog = state.phase === 'loading' || state.isRefreshing || models.isFetching;
  const prepare = useEffectEvent(async () =>
    selected ? complete({ kind: 'subscription', model: selected }) : false,
  );
  const cancelPreparation = useEffectEvent(cancel);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void prepare().then((saved) => {
      if (active && !saved) setFailed(true);
    });
    return () => {
      active = false;
      cancelPreparation();
    };
  }, [attempt, selectedId]);

  const retry = () => {
    setFailed(false);
    setAttempt((current) => current + 1);
    void Promise.allSettled([cloud.refresh(), models.refetch()]);
  };

  if (state.phase === 'signed_out' || (state.phase === 'ready' && !subscribed))
    return <Redirect href="/onboarding" />;
  const loading = preparingCatalog || models.isPending || (selected && !failed);
  return (
    <OnboardingPage title={t('onboarding.source.title')}>
      {loading ? (
        <OnboardingMessage loading>{t('onboarding.loading')}</OnboardingMessage>
      ) : (
        <>
          <OnboardingMessage>
            {t(failed ? 'onboarding.saveFailed' : 'settings.provider.models.management.loadFailed')}
          </OnboardingMessage>
          <OnboardingButton onPress={retry}>{t('common.retry')}</OnboardingButton>
        </>
      )}
    </OnboardingPage>
  );
}
