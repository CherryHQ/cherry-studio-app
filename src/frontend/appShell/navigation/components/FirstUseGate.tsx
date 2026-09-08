import { ContentState } from '@cherrystudio/ui/components';
import { Redirect } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { usePreference, useQuery } from '@/frontend/data';
import { useLatestAgentSession } from '@/frontend/hooks/agent';

/** Seeded Agents have no model, so first use is determined before restoring the chat route. */
export function FirstUseGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const [status] = usePreference('app.onboarding.status');
  const models = useQuery('/models', {
    enabled: status === 'unseen',
    query: { enabled: true, isSystemSupported: true },
    retry: false,
  });
  // Chat restoration shares this key, so both readers must use the same paginated cache shape.
  const latestSession = useLatestAgentSession({
    enabled: status === 'unseen',
  });

  if (status === 'pending') return <Redirect href="/onboarding" />;
  if (status !== 'unseen') return children;
  // A background refresh must not unmount chat, whose latest-session reader refreshes on mount.
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
  return <Redirect href="/onboarding" />;
}
