import CircleAlertIcon from '@cherrystudio/app-icons/icons/circle-alert';
import { Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAgentSessionStatus } from '@/frontend/hooks/agent';
import { useThemeColor } from '@/frontend/hooks/useThemeColor';

export function SessionStatus({ sessionId }: { sessionId: string }) {
  const { status, isUnread } = useAgentSessionStatus(sessionId);
  const { t } = useTranslation();
  const spinnerColor = useThemeColor('foreground-tertiary');

  if (status === 'awaiting-approval') {
    return (
      <View className="shrink-0 rounded-full border border-warning-border bg-warning-subtle px-1.5">
        <Text className="font-medium text-warning-subtle-foreground text-xs" numberOfLines={1}>
          {t('session.status.awaitingApproval')}
        </Text>
      </View>
    );
  }

  const isRunning = status === 'running' || status === 'cancelling';
  const isFailed = status === 'failed';
  if (!isRunning && !isFailed && !isUnread) {
    return null;
  }

  const label = t(
    isRunning
      ? 'session.status.running'
      : isFailed
        ? 'session.status.failed'
        : 'session.status.completed',
  );

  return (
    <View className="shrink-0 flex-row items-center gap-1">
      {isRunning ? (
        <Spinner accessible={false} color={spinnerColor} size="sm" />
      ) : isFailed ? (
        <CircleAlertIcon accessible={false} className="size-3 text-error" />
      ) : (
        <View className="size-1.5 rounded-full bg-success" />
      )}
      <Text className="text-foreground-tertiary text-xs" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
