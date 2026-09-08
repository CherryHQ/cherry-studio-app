import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { chatRouteParams } from '@/frontend/appShell/navigation/chat';
import { useAgentSession } from '@/frontend/hooks/agent';

type ChatForkOriginDividerProps = {
  sourceSessionId: string;
};

export function ChatForkOriginDivider({ sourceSessionId }: ChatForkOriginDividerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const source = useAgentSession(sourceSessionId);
  const title = source.data?.title?.trim();

  const openSource = useCallback(() => {
    // The chat screen's pathname is always '/', so returning to the source is a
    // param swap; pushing would stack a second copy of the screen we came from.
    router.setParams(
      chatRouteParams({
        kind: 'session',
        sessionId: sourceSessionId,
      }),
    );
  }, [router, sourceSessionId]);

  // Deleting the source clears the lineage column, but this fork can render in
  // the window before that invalidation lands. A divider that names nothing,
  // or that leads to a session the user can no longer open, is worse than none.
  if (!title) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={t('chat.fork.openSource')}
      accessibilityRole="button"
      className="flex-row items-center gap-3 px-4 py-3"
      onPress={openSource}
      testID="chat-fork-origin"
    >
      <View className="h-px flex-1 bg-border" />
      <View className="min-w-0 shrink flex-row items-center" testID="chat-fork-origin-label">
        {/* Every translated fragment is wrapped in Text so the title remains an
            independently constrained flex item without fixing the locale's word order. */}
        <Trans
          components={{
            label: <Text className="shrink-0 text-muted-foreground text-sm" numberOfLines={1} />,
            origin: (
              <Text
                className="min-w-0 max-w-56 shrink text-foreground text-sm underline"
                numberOfLines={1}
                testID="chat-fork-origin-title"
              />
            ),
            suffix: <Text className="shrink-0 text-muted-foreground text-sm" numberOfLines={1} />,
          }}
          i18nKey="chat.fork.origin"
          parent={null}
          values={{ title }}
        />
      </View>
      <View className="h-px flex-1 bg-border" />
    </Pressable>
  );
}
