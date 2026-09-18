import { Button, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useChatSource } from '@/frontend/appShell/navigation/chat';
import { useRemoteActions, useRemoteAgent } from '@/frontend/appShell/remoteAgent';

export function RemoteActions({ sessionId, agentId }: { sessionId?: string; agentId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { openRemote } = useChatSource();
  const { controller, connectionId } = useRemoteAgent();
  const actions = useRemoteActions().filter(
    (action) =>
      (['confirming', 'failed', 'interrupted'].includes(action.status) ||
        (!sessionId && action.kind === 'create' && Boolean(action.sessionId))) &&
      (sessionId
        ? action.sessionId === sessionId
        : action.kind === 'create' && action.agentId === agentId),
  );
  if (!actions.length) return null;
  return (
    <View className="gap-2 px-4">
      {actions.map((action) => (
        <View key={action.id} className="gap-1 py-2">
          <Text className="text-sm text-muted-foreground">
            {t(
              action.status === 'confirming'
                ? 'remoteAgent.confirming'
                : action.status === 'failed' || action.status === 'interrupted'
                  ? 'remoteAgent.actionFailed'
                  : 'remoteAgent.actionReceived',
            )}
          </Text>
          <View className="flex-row gap-2">
            {action.status === 'confirming' || action.status === 'failed' ? (
              <Button
                size="sm"
                variant="ghost"
                onPress={() =>
                  void controller
                    .retryAction(action.id)
                    .catch(() =>
                      toast.show({ label: t('remoteAgent.actionFailed'), variant: 'danger' }),
                    )
                }
              >
                {t('common.retry')}
              </Button>
            ) : null}
            {!sessionId && action.kind === 'create' && action.sessionId ? (
              <Button
                size="sm"
                onPress={() => {
                  controller.dismissAction(action.id);
                  openRemote({
                    connectionId,
                    agentId: action.agentId ?? agentId,
                    sessionId: action.sessionId,
                  });
                }}
              >
                {t('remoteAgent.openSession')}
              </Button>
            ) : null}
            {action.status !== 'confirming' ? (
              <Button size="sm" variant="ghost" onPress={() => controller.dismissAction(action.id)}>
                {t('common.close')}
              </Button>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
