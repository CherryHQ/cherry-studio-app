import { Button } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useDesktopConnection } from '@/frontend/hooks/useDesktopConnections';

import { useRemoteAgent, useRemoteConnection } from './RemoteAgentProvider';

export function RemoteConnectionBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const { controller, connectionId } = useRemoteAgent();
  const state = useRemoteConnection();
  const { connection } = useDesktopConnection(connectionId);
  const repair = [
    'agent-pairing-required',
    'auth-revoked',
    'agent-identity-changed',
    'IDENTITY_CHANGED',
  ].includes(state.error ?? '');
  const label =
    state.error === 'agent-identity-changed' || state.error === 'IDENTITY_CHANGED'
      ? t('remoteAgent.identityChanged')
      : repair
        ? t('remoteAgent.pairAgain')
        : state.error === 'agent-unavailable'
          ? t('remoteAgent.unavailable')
          : state.status === 'ready'
            ? t('remoteAgent.connected', { name: connection?.name ?? '' })
            : state.status === 'connecting' || state.status === 'reconnecting'
              ? t('remoteAgent.connecting')
              : t('remoteAgent.disconnected');
  return (
    <View className="flex-row items-center gap-2 px-4 py-2">
      <Text accessibilityLiveRegion="polite" className="flex-1 text-sm text-muted-foreground">
        {label}
      </Text>
      {state.status !== 'ready' ? (
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            repair
              ? router.push({
                  pathname: '/settings/device-connections/scan',
                  params: { connectionId },
                })
              : controller.reconnect()
          }
        >
          {t(repair ? 'remoteAgent.repair' : 'common.retry')}
        </Button>
      ) : null}
    </View>
  );
}
