import { KeyboardAwareLegendList } from '@legendapp/list/keyboard';
import { type LegendListRef, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { ScrollShadow } from 'heroui-native/scroll-shadow';
import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  View,
} from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { LinearGradient } from '@/components/uniwind';
import type { Message } from '@/data/types/message';

import { AssistantMessageItem, UserMessageItem } from '../../messageItem';
import { getMessageListScrollSignal } from '../utils/messageListScrollSignals';

// 用户气泡计入「锚点下方内容」的最大高度：超长用户消息超出部分会滚出顶部，而非把锚定区占满。
const USER_ANCHOR_MAX_SIZE = 120;
// 被锚定的用户消息距内容区顶部（顶部安全区/导航栏之下）的视觉间距。
const ANCHOR_TOP_GAP = 12;

type ChatMessageListProps = {
  anchorIndex: number;
  contentBottomInset: number;
  contentTopInset: number;
  isAtBottom: SharedValue<boolean>;
  listRef: RefObject<LegendListRef | null>;
  messages: readonly Message[];
  onLoadOlder: () => Promise<void>;
  onPrefetchOlder: () => void;
  onReady?: () => void;
};

function renderMessageItem({ item }: LegendListRenderItemProps<Message>) {
  return item.role === 'user' ? (
    <UserMessageItem message={item} />
  ) : (
    <AssistantMessageItem message={item} />
  );
}

export function ChatMessageList({
  anchorIndex,
  contentBottomInset,
  contentTopInset,
  isAtBottom,
  listRef,
  messages,
  onLoadOlder,
  onPrefetchOlder,
  onReady,
}: ChatMessageListProps) {
  const [contentBaseHeight, setContentBaseHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const didReportReadyRef = useRef(false);
  const isMountedRef = useRef(true);
  const pendingReadyFrameRef = useRef<number | null>(null);
  const readyGenerationRef = useRef(0);
  const lastMessageId = messages[messages.length - 1]?.id;
  const listHeader = useMemo(() => <View style={{ height: contentTopInset }} />, [contentTopInset]);
  const handleStartReached = useCallback(() => {
    void onLoadOlder();
  }, [onLoadOlder]);
  const hasAnchor = anchorIndex >= 0;
  const visibleHeightAboveInput = Math.max(0, viewportHeight - contentBottomInset);
  // 锚定期间内容区始终视为「已撑满」，恒为浮动输入框预留底部空间。
  const bottomPadding =
    hasAnchor || (viewportHeight > 0 && contentBaseHeight > visibleHeightAboveInput)
      ? contentBottomInset
      : 0;

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: bottomPadding,
      paddingTop: 12,
    }),
    [bottomPadding],
  );

  // 把刚发送的用户消息锚定到内容区顶部，并在其下方补足空白，让助手回复流式生长其间。
  const anchoredEndSpace = useMemo(
    () =>
      hasAnchor
        ? {
            anchorIndex,
            anchorMaxSize: USER_ANCHOR_MAX_SIZE,
            anchorOffset: contentTopInset + ANCHOR_TOP_GAP,
          }
        : undefined,
    [anchorIndex, contentTopInset, hasAnchor],
  );

  // 锚定期间只在追加新消息时滚到底（把用户消息送到顶部），不跟随流式文字逐帧粘底；
  // 非锚定期间维持原有粘底行为。
  const maintainScrollAtEnd = useMemo(
    () => ({
      animated: hasAnchor,
      on: hasAnchor
        ? { dataChange: true, itemLayout: false, layout: false }
        : { dataChange: true, itemLayout: true, layout: true },
    }),
    [hasAnchor],
  );

  // 把列表「是否精确在最底部」同步到共享值，驱动悬浮的「滚动到底部」按钮显隐。
  const sharedValues = useMemo(() => ({ isAtEnd: isAtBottom }), [isAtBottom]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { isNearStart } = getMessageListScrollSignal(event);

      if (isNearStart) {
        onPrefetchOlder();
      }
    },
    [onPrefetchOlder],
  );

  const cancelPendingReadyFrame = useCallback(() => {
    if (pendingReadyFrameRef.current !== null) {
      cancelAnimationFrame(pendingReadyFrameRef.current);
      pendingReadyFrameRef.current = null;
    }
  }, []);

  const reportReady = useCallback(() => {
    if (didReportReadyRef.current || !isMountedRef.current) {
      return;
    }

    didReportReadyRef.current = true;
    onReady?.();
  }, [onReady]);

  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      setContentBaseHeight(Math.max(0, height - bottomPadding));
    },
    [bottomPadding],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);

  useEffect(() => {
    readyGenerationRef.current += 1;
    const generation = readyGenerationRef.current;

    cancelPendingReadyFrame();

    if (
      didReportReadyRef.current ||
      contentBaseHeight <= 0 ||
      !lastMessageId ||
      viewportHeight <= 0
    ) {
      return;
    }

    const shouldScrollToEndBeforeReady = bottomPadding > 0;

    pendingReadyFrameRef.current = requestAnimationFrame(() => {
      pendingReadyFrameRef.current = requestAnimationFrame(() => {
        pendingReadyFrameRef.current = null;

        if (
          didReportReadyRef.current ||
          !isMountedRef.current ||
          readyGenerationRef.current !== generation
        ) {
          return;
        }

        const reportReadyAfterNextFrame = () => {
          pendingReadyFrameRef.current = requestAnimationFrame(() => {
            pendingReadyFrameRef.current = null;

            if (readyGenerationRef.current === generation) {
              reportReady();
            }
          });
        };

        if (shouldScrollToEndBeforeReady) {
          void listRef.current?.scrollToEnd({ animated: false }).finally(reportReadyAfterNextFrame);
          return;
        }

        reportReadyAfterNextFrame();
      });
    });
  }, [
    bottomPadding,
    cancelPendingReadyFrame,
    contentBaseHeight,
    lastMessageId,
    listRef,
    reportReady,
    viewportHeight,
  ]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cancelPendingReadyFrame();
    };
  }, [cancelPendingReadyFrame]);

  return (
    <ScrollShadow
      LinearGradientComponent={LinearGradient}
      className="flex-1"
      visibility="bottom"
      size={80}
    >
      <KeyboardAwareLegendList
        ref={listRef}
        anchoredEndSpace={anchoredEndSpace}
        automaticallyAdjustsScrollIndicatorInsets
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="never"
        data={messages}
        drawDistance={80}
        estimatedItemSize={300}
        estimatedHeaderSize={contentTopInset}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="interactive"
        keyboardLiftBehavior="whenAtEnd"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        initialScrollAtEnd
        maintainScrollAtEnd={maintainScrollAtEnd}
        maintainScrollAtEndThreshold={0.12}
        maintainVisibleContentPosition={{ data: true }}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        onScroll={handleScroll}
        onStartReached={handleStartReached}
        onStartReachedThreshold={0.05}
        recycleItems={false}
        renderItem={renderMessageItem}
        scrollsToTop
        sharedValues={sharedValues}
        className="flex-1"
      />
    </ScrollShadow>
  );
}
