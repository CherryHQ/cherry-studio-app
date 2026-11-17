import { ContentState } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  ConversationSourceBoundary,
  useConversationSourceState,
} from '@/frontend/appShell/conversation';
import { useChatSource } from '@/frontend/appShell/navigation/chat';
import { useDesktopConnections } from '@/frontend/hooks/useDesktopConnections';

export function SidebarDesktopSource({
  header,
  showLoading,
  children,
}: {
  header: ReactNode;
  showLoading: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { remoteTarget } = useChatSource();
  const { connections, isLoading: isLoadingDevices } = useDesktopConnections();
  const connectionId = remoteTarget.connectionId;
  const isSelectingDevice =
    isLoadingDevices || connections.some((connection) => connection.status === 'paired');
  const selected = connections.find((connection) => connection.id === connectionId);
  const loading = showLoading ? (
    <View className="py-4">
      <ContentState.Loading title={t('remoteAgent.loading')} />
    </View>
  ) : null;
  return connectionId ? (
    <ConversationSourceBoundary
      key={connectionId}
      source={{ kind: 'desktop', connectionId }}
      fallback={(state) => (
        <RemoteSidebarFrame header={header}>
          {state === 'loading' ? (
            loading
          ) : (
            <View className="px-5 py-4">
              <ContentState.Error title={t('remoteAgent.loadFailed')} />
            </View>
          )}
        </RemoteSidebarFrame>
      )}
    >
      <RemoteSidebarFrame
        header={header}

        status={<RemoteConnectionStatus name={selected?.name ?? ''} />}
      >
        {children}
      </RemoteSidebarFrame>
    </ConversationSourceBoundary>
  ) : (
    <RemoteSidebarFrame header={header}>
      {isSelectingDevice ? (
        loading
      ) : (
        <View className="px-5 py-4">
          <ContentState.Empty
            title={t('settings.deviceConnections.empty')}
            description={t('settings.deviceConnections.emptyDescription')}
            primaryAction={{
              children: t('settings.deviceConnections.scan.action'),
              onPress: () => router.push('/settings/device-connections/scan'),
            }}
          />
        </View>
      )}
    </RemoteSidebarFrame>
  );
}

function RemoteSidebarFrame({
  header,
  status,
  children,
}: {
  header: ReactNode;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <View className="flex-row items-center gap-2 px-5 pt-4 pb-1">
        {header}
        <View className="size-1.5 shrink-0">{status}</View>
      </View>
      {children}
    </>
  );
}

function RemoteConnectionStatus({ name }: { name: string }) {
  const { t } = useTranslation();
  const { availability } = useConversationSourceState();
  return availability.state === 'enabled' ? (
    <View
      accessible
      accessibilityLabel={t('remoteAgent.connected', { name })}
      accessibilityRole="image"
      className="size-1.5 shrink-0 rounded-full bg-success"
      testID="sidebar-remote-connected"
    />
  ) : null;
}
