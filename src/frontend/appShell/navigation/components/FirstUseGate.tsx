import { ContentState } from '@cherrystudio/ui/components';
import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAccount } from '@/frontend/appShell/account';
import { withCapability } from '@/frontend/components/Policy';
import { usePreference, useQuery } from '@/frontend/data';
import { useLatestAgentSession } from '@/frontend/hooks/agent';

function OnboardingGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const [status] = usePreference('app.onboarding.status');
  const { state: account } = useAccount();
  const models = useQuery('/models', {
    enabled: status === 'unseen',
    query: { enabled: true, isSystemSupported: true },
    retry: false,
  });
  // Existing conversations also identify an installation that should skip onboarding.
  const latestSession = useLatestAgentSession({ enabled: status === 'unseen' });

  if (status === 'pending') return <Redirect href="/onboarding" />;
  if (status !== 'unseen') return children;
  // A background refresh must not unmount an already admitted chat.
  if (models.isPending || latestSession.isLoading) {
    return (
      <View className="flex-1 justify-center">
        <ContentState.Loading title={t('onboarding.loading')} />
      </View>
    );
  }
  // A failed read never treats an existing installation as a first launch.
  if (
    models.isError ||
    latestSession.error ||
    (models.data?.length ?? 0) > 0 ||
    latestSession.session
  )
    return children;
  // A new installation signs in, or skips signing in, before choosing how to set up models.
  return <Redirect href={!account.hasPrompted ? '/login' : '/onboarding'} />;
}

function Children({ children }: PropsWithChildren) {
  return children;
}

/**
 * Seeded Agents have no model, so first use is determined before restoring the chat route.
 * Onboarding sets up providers and default models, which the organization may own instead.
 */
export const FirstUseGate = withCapability('providerOnboarding', OnboardingGate, Children);
