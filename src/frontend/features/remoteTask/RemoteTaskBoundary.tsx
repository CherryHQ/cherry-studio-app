import { ContentState } from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConversationSourceBoundary } from '@/frontend/appShell/conversation';
import { RouteHeader } from '@/frontend/appShell/header';

export function RemoteTaskBoundary({
  connectionId,
  children,
}: PropsWithChildren<{ connectionId?: string }>) {
  return connectionId ? (
    <ConversationSourceBoundary
      source={{ kind: 'desktop', connectionId }}
      fallback={renderUnavailable}
    >
      {children}
    </ConversationSourceBoundary>
  ) : (
    <Unavailable state="error" />
  );
}

function renderUnavailable(state: 'loading' | 'error') {
  return <Unavailable state={state} />;
}

function Unavailable({ state }: { state: 'loading' | 'error' }) {
  const { t } = useTranslation();
  return (
    <>
      <RouteHeader title={t('remoteTasks.title')} />
      <View className="flex-1 justify-center bg-background px-8 py-16">
        {state === 'loading' ? (
          <ContentState.Loading title={t('remoteAgent.connecting')} />
        ) : (
          <ContentState.Error
            title={t('remoteAgent.loadFailed')}
            primaryAction={{
              children: t('settings.deviceConnections.title'),
              onPress: () => router.push('/settings/device-connections'),
            }}
          />
        )}
      </View>
    </>
  );
}
