import { ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useAgentChatClient, useAgentSessionState } from '../runtime';

/** Transient engine state; it never rewrites a turn that can resume from durable storage. */
export function LocalRuntimeStatus({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const { client } = useAgentChatClient();
  const state = useAgentSessionState(sessionId);
  const failed = state.status === 'error';
  const showContextStatus =
    state.contextStatus === 'compacting' || state.contextStatus === 'compaction-failed';
  // Background compaction can outlive the answer; it must not look like a blocked reply.
  if (!failed && !showContextStatus) return null;
  return (
    <View className="px-4 py-2">
      {failed ? (
        <ContentState.Error
          title={t('chat.runtime.failed')}
          primaryAction={{
            children: t('common.retry'),
            onPress: () => {
              void client.refresh(sessionId).catch(() => {});
            },
          }}
        />
      ) : (
        <Text
          accessibilityLiveRegion="polite"
          className="text-center text-xs text-muted-foreground"
        >
          {state.contextStatus === 'compacting'
            ? t('chat.compaction.compacting')
            : t('chat.compaction.failed')}
        </Text>
      )}
    </View>
  );
}
