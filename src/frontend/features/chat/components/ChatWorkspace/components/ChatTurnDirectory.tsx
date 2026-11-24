import XIcon from '@cherrystudio/app-icons/icons/x';
import { BackgroundPressExclusion, Button, Spinner, useToast } from '@cherrystudio/ui/components';
import { haptics } from '@cherrystudio/ui/haptics';
import { duration, easing } from '@cherrystudio/ui/motion';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Keyboard, Pressable, Text, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  Extrapolation,
  interpolate,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { HistoryPosition } from '@/frontend/appShell/conversation/remote';
import { useFocusedBackPress } from '@/frontend/appShell/navigation';
import type { MessageListHandle } from '@/frontend/components/Message';
import { useLayoutWidth } from '@/frontend/hooks/useLayoutWidth';

import type { ChatTurn, ChatTurnNavigator } from '../chatTurns';

const DIRECTORY_WIDTH = 300;
const MAX_LIST_HEIGHT = 300;
const PANEL_LIMIT = { width: DIRECTORY_WIDTH, maxWidth: '100%', maxHeight: '100%' } as const;
const LIST_LIMIT = { maxHeight: MAX_LIST_HEIGHT, flexGrow: 0 } as const;
const LIST_CONTENT_STYLE = {
  paddingTop: 6,
  paddingBottom: 10,
  paddingLeft: 8,
  paddingRight: 12,
} as const;
const LIST_SCROLL_INDICATOR_INSETS = { top: 4, bottom: 12, right: 0 } as const;
const RAIL_STYLE = { gap: 4.5, width: 14 } as const;
const TRIGGER_TICKS = ['t0', 't1', 't2', 't3', 't4', 't5', 't6'] as const;
export const MAX_TRIGGER_TICKS = TRIGGER_TICKS.length;
const TICK_MIN_WIDTH = 5.5;
const TICK_MAX_WIDTH = 13;
const TICK_MIN_OPACITY = 0.22;
const TICK_MAX_OPACITY = 0.68;
const TICK_MIN_SCALE_Y = 0.75;
const TICK_FISHEYE_RADIUS = 1.65;
const TICK_TRACK_STYLE = { height: 2, width: TICK_MAX_WIDTH } as const;
const TICK_BAR_STYLE = { width: TICK_MAX_WIDTH } as const;
const turnKey = (turn: ChatTurn) => turn.id;

export function resolveTurnDirectoryTickCount(turnCount?: number): number {
  if (turnCount === undefined || !Number.isFinite(turnCount)) return MAX_TRIGGER_TICKS;
  return Math.min(MAX_TRIGGER_TICKS, Math.max(2, Math.floor(turnCount)));
}

export function getFisheyeTickMetrics(progress: number, index: number, count: number) {
  'worklet';
  const clamped = Math.min(1, Math.max(0, progress));
  const focus = count > 1 ? clamped * (count - 1) : 0;
  const distance = Math.abs(index - focus);
  const normalized = Math.min(1, distance / TICK_FISHEYE_RADIUS);
  const influence = (1 - normalized) * (1 - normalized) * (1 + 2 * normalized);
  return {
    width: TICK_MIN_WIDTH + (TICK_MAX_WIDTH - TICK_MIN_WIDTH) * influence,
    opacity: TICK_MIN_OPACITY + (TICK_MAX_OPACITY - TICK_MIN_OPACITY) * influence,
    scaleY: TICK_MIN_SCALE_Y + (1 - TICK_MIN_SCALE_Y) * influence,
  };
}

function FisheyeTick({
  count,
  index,
  scrollProgress,
}: {
  count: number;
  index: number;
  scrollProgress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const { opacity, scaleY, width } = getFisheyeTickMetrics(scrollProgress.get(), index, count);
    return {
      opacity,
      transform: [{ translateX: TICK_MAX_WIDTH - width }, { scaleY }],
    };
  }, [count, index, scrollProgress]);

  return (
    <View className="overflow-hidden rounded-r-full" style={TICK_TRACK_STYLE}>
      <Animated.View
        className="h-0.5 rounded-full bg-foreground"
        style={[TICK_BAR_STYLE, animatedStyle]}
        testID="chat-turn-directory-tick"
      />
    </View>
  );
}

export function ChatTurnDirectory({
  navigator,
  bottomAccessoryHeight,
  contentBottomInset,
  contentTopInset,
  dockLift,
  keyboardOffset,
  scrollProgress,
  scrollToMessage,
  turnCount,
}: {
  navigator: ChatTurnNavigator;
  bottomAccessoryHeight: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  dockLift?: SharedValue<number>;
  keyboardOffset: number;
  scrollProgress: SharedValue<number>;
  scrollToMessage: MessageListHandle['scrollToMessage'];
  turnCount?: number;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [hasExited, setHasExited] = useState(true);
  const motion = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  const presentation = useRef({ open: false, closeId: 0 });
  const tickCount = resolveTurnDirectoryTickCount(turnCount);

  // The trigger and panel share an interruptible transition. Keep rows mounted through exit,
  // but release their touch and accessibility surfaces on the closing action.
  const open = useCallback(() => {
    if (presentation.current.open) return;
    presentation.current.open = true;
    haptics.light();
    Keyboard.dismiss();
    setHasExited(false);
    setIsOpen(true);
    motion.set(
      reducedMotion
        ? 1
        : withTiming(1, {
            duration: duration.slow,
            easing: easing.overshoot,
            reduceMotion: ReduceMotion.System,
          }),
    );
  }, [motion, reducedMotion]);
  const finishExit = useCallback((closeId: number) => {
    if (!presentation.current.open && presentation.current.closeId === closeId) {
      setHasExited(true);
    }
  }, []);
  const close = useCallback(() => {
    if (!presentation.current.open) return;
    presentation.current.open = false;
    const closeId = ++presentation.current.closeId;
    setIsOpen(false);
    if (reducedMotion) {
      motion.set(0);
      finishExit(closeId);
      return;
    }
    motion.set(
      withTiming(
        0,
        {
          duration: duration.base,
          easing: easing.settle,
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) scheduleOnRN(finishExit, closeId);
        },
      ),
    );
  }, [finishExit, motion, reducedMotion]);
  useFocusedBackPress(close, isOpen);
  const { onLayout, width: containerWidth } = useLayoutWidth();
  const { height, progress } = useReanimatedKeyboardAnimation();
  const triggerRightInset =
    containerWidth >= 832 ? Math.max(8, Math.floor((containerWidth - 720) / 2) - 24) : 2;
  const panelRightInset =
    containerWidth >= 832 ? Math.max(16, Math.floor((containerWidth - 720) / 2)) : 16;
  const position = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          -(
            bottomAccessoryHeight.get() +
            (dockLift?.get() ?? Math.max(0, -height.get() - progress.get() * keyboardOffset))
          ) / 2,
      },
    ],
  }));
  const panelMotion = useAnimatedStyle(() => ({
    opacity: interpolate(motion.get(), [0, 0.25, 1], [0, 1, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(motion.get(), [0, 1], [24, 0]) },
      { scale: interpolate(motion.get(), [0, 1], [0.86, 1]) },
    ],
  }));
  const triggerMotion = useAnimatedStyle(() => ({
    opacity: interpolate(motion.get(), [0, 0.25, 1], [1, 0, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(motion.get(), [0, 1], [0, 8], Extrapolation.CLAMP) }],
  }));
  const top = contentTopInset + 12;
  const bottom = Math.max(contentBottomInset, 12) + 16;

  async function select(turn: ChatTurn, targetProgress?: number) {
    if (!presentation.current.open) return;
    const previousProgress = scrollProgress.get();
    if (targetProgress !== undefined) {
      scrollProgress.set(targetProgress);
    }
    close();
    const result = await navigator.jump(turn, scrollToMessage);
    if (result === 'unavailable' || result === 'retryable' || result === 'cancelled') {
      scrollProgress.set(previousProgress);
    }
    if (result === 'unavailable') toast.show({ label: t('chat.history.messageUnavailable') });
    if (result === 'retryable')
      toast.show({ label: t('chat.turns.jumpFailed'), variant: 'danger' });
  }

  return (
    <View className="absolute inset-0" onLayout={onLayout} pointerEvents="box-none">
      {isOpen ? (
        <BackgroundPressExclusion className="absolute inset-0">
          <Pressable
            accessible={false}
            className="absolute inset-0"
            onPress={close}
            testID="chat-turn-directory-backdrop"
          />
        </BackgroundPressExclusion>
      ) : null}
      <Animated.View
        accessibilityElementsHidden={isOpen}
        className="absolute left-4 flex-row-reverse items-center"
        importantForAccessibility={isOpen ? 'no-hide-descendants' : 'auto'}
        pointerEvents={isOpen ? 'none' : 'box-none'}
        style={[{ right: triggerRightInset, top, bottom }, position]}
      >
        <Animated.View style={triggerMotion}>
          <BackgroundPressExclusion>
            <Pressable
              accessibilityLabel={t('chat.turns.title')}
              accessibilityRole="button"
              accessibilityState={{ expanded: false }}
              className="min-h-12 min-w-10 items-end justify-center py-3 pr-0.5 pl-5 active:opacity-60"
              hitSlop={8}
              onPress={open}
              testID="chat-turn-directory-trigger"
            >
              <View className="items-end" style={RAIL_STYLE}>
                {TRIGGER_TICKS.slice(0, tickCount).map((id, index) => (
                  <FisheyeTick
                    count={tickCount}
                    key={id}
                    index={index}
                    scrollProgress={scrollProgress}
                  />
                ))}
              </View>
            </Pressable>
          </BackgroundPressExclusion>
        </Animated.View>
      </Animated.View>
      {!hasExited ? (
        <Animated.View
          accessibilityElementsHidden={!isOpen}
          className="absolute left-4 flex-row-reverse items-center"
          importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}
          pointerEvents={isOpen ? 'box-none' : 'none'}
          style={[{ right: panelRightInset, top, bottom }, position]}
          testID="chat-turn-directory-layer"
        >
          <Animated.View
            className="max-h-full max-w-full shrink"
            style={[{ transformOrigin: 'right center' }, panelMotion]}
          >
            <ChatTurnDirectoryPanel navigator={navigator} onClose={close} onSelect={select} />
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function ChatTurnDirectoryPanel({
  navigator,
  onClose,
  onSelect,
}: {
  navigator: ChatTurnNavigator;
  onClose(): void;
  onSelect(turn: ChatTurn, targetProgress?: number): Promise<void>;
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
      className="shrink rounded-3xl border border-border-subtle bg-popover shadow-md"
      style={PANEL_LIMIT}
      testID="chat-turn-directory"
    >
      <BackgroundPressExclusion className="shrink overflow-hidden rounded-3xl">
        <View className="flex-row items-center justify-between border-border-subtle border-b py-2 pr-2.5 pl-4">
          <View className="flex-row items-center gap-1.5">
            <Text className="font-semibold text-popover-foreground text-xs">
              {t('chat.turns.title')}
            </Text>
            {!navigator.numbersFromLatest && rows.length > 0 ? (
              <Text className="text-muted-foreground text-xs tabular-nums">
                {rows.length.toLocaleString(i18n.resolvedLanguage)}
              </Text>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t('common.close')}
            accessibilityRole="button"
            className="h-7 w-7 items-center justify-center rounded-full active:bg-secondary"
            hitSlop={6}
            onPress={onClose}
            testID="chat-turn-directory-close"
          >
            <XIcon className="size-3.5 text-muted-foreground" />
          </Pressable>
        </View>
        {turns.isPending ? (
          <View className="items-center py-6">
            <Spinner
              accessibilityLabel={t('chat.history.loading')}
              accessibilityRole="progressbar"
              size="sm"
            />
          </View>
        ) : turns.isError && rows.length === 0 ? (
          <View className="items-start gap-2 px-4 py-3">
            <Text className="text-popover-foreground text-sm">{t('chat.history.loadFailed')}</Text>
            <Button onPress={() => void turns.refetch()} size="sm" variant="tonal">
              {t('common.retry')}
            </Button>
          </View>
        ) : rows.length === 0 && !turns.hasNextPage ? (
          <Text className="px-4 py-3 text-muted-foreground text-sm">{t('chat.turns.empty')}</Text>
        ) : (
          <FlatList
            automaticallyAdjustsScrollIndicatorInsets={false}
            className="shrink"
            contentContainerStyle={LIST_CONTENT_STYLE}
            data={rows}
            keyboardShouldPersistTaps="always"
            keyExtractor={turnKey}
            onEndReached={turns.isFetchNextPageError ? undefined : loadMore}
            onEndReachedThreshold={0.2}
            scrollIndicatorInsets={LIST_SCROLL_INDICATOR_INSETS}
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
              const targetProgress =
                !navigator.numbersFromLatest && rows.length > 1
                  ? 1 - index / (rows.length - 1)
                  : undefined;
              return (
                <Pressable
                  accessibilityLabel={t(
                    navigator.numbersFromLatest ? 'chat.turns.rowFromLatest' : 'chat.turns.row',
                    { number, preview },
                  )}
                  accessibilityRole="button"
                  className="min-h-11 flex-row items-center gap-2 rounded-xl py-2 pr-2.5 pl-2 active:bg-secondary"
                  onPress={() =>
                    void onSelect(
                      turns.isStale && item.activeNodeId
                        ? { ...item, activeNodeId: undefined }
                        : item,
                      targetProgress,
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
