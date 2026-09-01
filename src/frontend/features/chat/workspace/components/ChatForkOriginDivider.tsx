import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { chatRouteParams } from '@/frontend/components/navigation/chat';
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
      <Text className="shrink text-muted-foreground text-sm" numberOfLines={1}>
        {/*
          The slot tag must not collide with an HTML void element — Trans parses
          the translated string as markup, and a void name such as `source`
          would close the tag before the title ever reached it.
        */}
        <Trans
          components={{ origin: <Text className="text-foreground underline" /> }}
          i18nKey="chat.fork.origin"
          values={{ title }}
        />
      </Text>
      <View className="h-px flex-1 bg-border" />
    </Pressable>
  );
}
