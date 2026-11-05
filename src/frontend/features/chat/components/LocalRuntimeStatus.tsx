import { ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { LocalAgentRecoveryStatus } from '@/shared/contracts/localAgentRecovery';

import { useAgentChatClient, useAgentSessionState } from '../runtime';

/** Transient engine state; it never rewrites a turn that can resume from durable storage. */
export function LocalRuntimeStatus({ sessionId }: { sessionId?: string }) {
  const { t } = useTranslation();
  const { client } = useAgentChatClient();
  const state = useAgentSessionState(sessionId);
  if (state.localRecoveryStatus) return <RecoveryStatus status={state.localRecoveryStatus} />;
  const failed = state.status === 'error';
  const retrying = state.activeTurn?.status === 'running' && state.activeTurn.isRetrying === true;
  const paused = state.activeTurn?.status === 'running' && state.activeTurn.isPaused === true;
  const notice = paused
    ? t('chat.runtime.paused')
    : state.contextStatus === 'compacting'
      ? t('chat.compaction.compacting')
      : retrying
        ? t('chat.runtime.retrying')
        : state.contextStatus === 'compaction-failed'
          ? t('chat.compaction.failed')
          : null;
  if (!failed && !notice) return null;
  return (
    <View className="px-4 py-2">
      {failed ? (
        <ContentState.Error
          title={t('chat.runtime.failed')}
          primaryAction={{
            children: t('common.retry'),
            onPress: () => {
              if (sessionId) void client.refresh(sessionId).catch(() => {});
            },
          }}
        />
      ) : (
        <Text
          accessibilityLiveRegion="polite"
          className="text-center text-xs text-muted-foreground"
        >
          {notice}
        </Text>
      )}
    </View>
  );
}

function RecoveryStatus({ status }: { status: NonNullable<LocalAgentRecoveryStatus> }) {
  const { t } = useTranslation();
  const { client } = useAgentChatClient();
  const { alert } = useAlert();
  const { toast } = useToast();
  const [resetting, setResetting] = useState(false);
  const blocked = status.kind === 'blocked' || status.reason === 'blocked';
  return (
    <View className="px-4 py-2">
      <ContentState.Error
        title={blocked ? t('chat.runtime.recoveryBlocked') : t('chat.media.unavailable')}
        primaryAction={{
          children: t('settings.data.runtimeCache.clear'),
          disabled: resetting,
          onPress: () =>
            alert.confirm({
              title: t('settings.data.runtimeCache.confirmTitle'),
              description: t('chat.runtime.recoveryBlockedResetConfirm'),
              confirmLabel: t('settings.data.runtimeCache.confirm'),
              role: 'destructive',
              onConfirm: () => {
                setResetting(true);
                void client
                  .resetBlockedAgent()
                  .catch(() => toast.show({ label: t('chat.runtime.failed'), variant: 'danger' }))
                  .finally(() => setResetting(false));
              },
            }),
        }}
      />
    </View>
  );
}
