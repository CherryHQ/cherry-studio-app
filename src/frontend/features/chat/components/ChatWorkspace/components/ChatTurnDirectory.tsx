import ListOrderedIcon from '@cherrystudio/app-icons/icons/list-ordered';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { BackgroundPressExclusion, Button, Spinner, useToast } from '@cherrystudio/ui/components';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';

import type { HistoryPosition } from '@/frontend/appShell/conversation/remote';
import { useFocusedBackPress } from '@/frontend/appShell/navigation';
import type { MessageListHandle } from '@/frontend/components/Message';
import { useLayoutWidth } from '@/frontend/hooks/useLayoutWidth';

import type { ChatTurn, ChatTurnNavigator } from '../chatTurns';

const DIRECTORY_WIDTH = 296;
const MAX_LIST_HEIGHT = 264;
const PANEL_LIMIT = { width: DIRECTORY_WIDTH, maxHeight: '100%' } as const;
const LIST_LIMIT = { maxHeight: MAX_LIST_HEIGHT, flexGrow: 0 } as const;
const turnKey = (turn: ChatTurn) => turn.id;

export function ChatTurnDirectory({
  navigator,
  bottomAccessoryHeight,
  contentBottomInset,
  contentTopInset,
  keyboardOffset,
  scrollToMessage,
}: {
  navigator: ChatTurnNavigator;
  bottomAccessoryHeight: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  keyboardOffset: number;
  scrollToMessage: MessageListHandle['scrollToMessage'];
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const close = useCallback(() => setIsOpen(false), []);
  useFocusedBackPress(close, isOpen);
  const { onLayout, width: containerWidth } = useLayoutWidth();
  const { height, progress } = useReanimatedKeyboardAnimation();
  const wideRightInset =
    containerWidth >= 832 ? Math.max(12, Math.floor((containerWidth - 720) / 2) - 56) : 12;
  const position = useAnimatedStyle(() => ({
    top: contentTopInset,
    bottom:
      bottomAccessoryHeight.get() +
      Math.max(0, -height.get() - progress.get() * keyboardOffset) +
      Math.max(contentBottomInset, 12),
  }));

  async function select(turn: ChatTurn) {
    close();
    const result = await navigator.jump(turn, scrollToMessage);
    if (result === 'unavailable') toast.show({ label: t('chat.history.messageUnavailable') });
    if (result === 'retryable')
      toast.show({ label: t('chat.turns.jumpFailed'), variant: 'danger' });
  }

  return (
    <View className="absolute inset-0" onLayout={onLayout} pointerEvents="box-none">
      {isOpen ? (
        <BackgroundPressExclusion className="absolute inset-0">
          <Pressable accessible={false} className="absolute inset-0" onPress={close} />
        </BackgroundPressExclusion>
      ) : null}
      <Animated.View
        className="absolute flex-row-reverse items-end gap-2"
        pointerEvents="box-none"
        style={[{ left: 12, right: wideRightInset }, position]}
      >
        <BackgroundPressExclusion className="size-11 items-center justify-center">
          <Button
            accessibilityLabel={t(isOpen ? 'common.close' : 'chat.turns.title')}
            accessibilityState={{ expanded: isOpen }}
            hitSlop={6}
            icon={isOpen ? <XIcon /> : <ListOrderedIcon />}
            onPress={() => setIsOpen((open) => !open)}
            size="sm"
            testID="chat-turn-directory-trigger"
            variant={isOpen ? 'default' : 'secondary'}
          />
        </BackgroundPressExclusion>
        {isOpen ? <ChatTurnDirectoryPanel navigator={navigator} onSelect={select} /> : null}
      </Animated.View>
    </View>
  );
}

function ChatTurnDirectoryPanel({
  navigator,
  onSelect,
}: {
  navigator: ChatTurnNavigator;
  onSelect(turn: ChatTurn): Promise<void>;
}) {
  const { i18n, t } = useTranslation();
  const turns = useInfiniteQuery({
    queryKey: navigator.queryKey,
    initialPageParam: undefined as HistoryPosition | undefined,
    queryFn: ({ pageParam, signal }) => navigator.read(pageParam, signal),
    getNextPageParam: (last, _pages, _previous, positions) => {
      const next = last.next;
      return next && !positions.some((position) => position?.cursor === next.cursor)
        ? next
        : undefined;
    },
    staleTime: navigator.numbersFromLatest ? Infinity : 60_000,
    retry: false,
  });
  const rows = useMemo(() => {
    const byId = new Map<string, ChatTurn>();
    for (const page of turns.data?.pages ?? []) {
      for (const item of page.items) if (!byId.has(item.id)) byId.set(item.id, item);
    }
    return [...byId.values()];
  }, [turns.data?.pages]);
  const loadMore = () => {
    if (turns.hasNextPage && !turns.isFetching) void turns.fetchNextPage({ cancelRefetch: false });
  };

  return (
    <View
      className="shrink rounded-3xl border border-border bg-popover shadow-sm"
      style={PANEL_LIMIT}
      testID="chat-turn-directory"
    >
      <BackgroundPressExclusion className="shrink p-2">
        {turns.isPending ? (
          <View className="items-center py-4">
            <Spinner
              accessibilityLabel={t('chat.history.loading')}
              accessibilityRole="progressbar"
              size="sm"
            />
          </View>
        ) : turns.isError && rows.length === 0 ? (
          <View className="items-start gap-2 px-2 pb-2">
            <Text className="text-popover-foreground text-sm">{t('chat.history.loadFailed')}</Text>
            <Button onPress={() => void turns.refetch()} size="sm" variant="tonal">
              {t('common.retry')}
            </Button>
          </View>
        ) : rows.length === 0 && !turns.hasNextPage ? (
          <Text className="px-2 pb-3 text-muted-foreground text-sm">{t('chat.turns.empty')}</Text>
        ) : (
          <FlatList
            className="shrink"
            data={rows}
            keyboardShouldPersistTaps="always"
            keyExtractor={turnKey}
            onEndReached={turns.isFetchNextPageError ? undefined : loadMore}
            onEndReachedThreshold={0.2}
            ListFooterComponent={
              turns.hasNextPage ? (
                <View className="items-center py-2">
                  {turns.isFetchingNextPage ? (
                    <Spinner
                      accessibilityLabel={t('chat.history.loading')}
                      accessibilityRole="progressbar"
                      size="sm"
                    />
                  ) : (
                    <Button onPress={loadMore} size="sm" variant="ghost">
                      {t(turns.isFetchNextPageError ? 'common.retry' : 'common.more')}
                    </Button>
                  )}
                </View>
              ) : undefined
            }
            renderItem={({ item, index }) => {
              const number = (
                navigator.numbersFromLatest ? index + 1 : rows.length - index
              ).toLocaleString(i18n.resolvedLanguage);
              const preview = item.preview || t('chat.turns.noText');
              return (
                <Pressable
                  accessibilityLabel={t(
                    navigator.numbersFromLatest ? 'chat.turns.rowFromLatest' : 'chat.turns.row',
                    { number, preview },
                  )}
                  accessibilityRole="button"
                  className="min-h-11 flex-row items-center gap-2 rounded-xl px-2 py-2 active:bg-secondary"
                  onPress={() =>
                    void onSelect(
                      turns.isStale && item.activeNodeId
                        ? { ...item, activeNodeId: undefined }
                        : item,
                    )
                  }
                >
                  <Text className="min-w-6 text-muted-foreground text-xs tabular-nums">
                    {navigator.numbersFromLatest ? `−${number}` : number}
                  </Text>
                  <Text className="flex-1 text-popover-foreground text-sm" numberOfLines={1}>
                    {preview}
                  </Text>
                </Pressable>
              );
            }}
            style={LIST_LIMIT}
          />
        )}
      </BackgroundPressExclusion>
    </View>
  );
}
