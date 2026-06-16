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

import { LinearGradient } from '@/components/uniwind';
import type { Message } from '@/data/types/message';

import { AssistantMessageItem, UserMessageItem } from '../../messageItem';
import { getMessageListScrollSignal } from '../utils/messageListScrollSignals';

type ChatMessageListProps = {
  contentBottomInset: number;
  contentTopInset: number;
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
  contentBottomInset,
  contentTopInset,
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
  const visibleHeightAboveInput = Math.max(0, viewportHeight - contentBottomInset);
  const bottomPadding =
    viewportHeight > 0 && contentBaseHeight > visibleHeightAboveInput ? contentBottomInset : 0;

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: bottomPadding,
      paddingTop: 12,
    }),
    [bottomPadding],
  );

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
        maintainScrollAtEnd={{
          animated: false,
          on: {
            dataChange: true,
            itemLayout: true,
            layout: true,
          },
        }}
        maintainScrollAtEndThreshold={0.12}
        maintainVisibleContentPosition={{ data: true }}
        onContentSizeChange={handleContentSizeChange}
        onLayout={handleLayout}
        onScroll={handleScroll}
        onStartReached={handleStartReached}
        onStartReachedThreshold={0.15}
        recycleItems={false}
        renderItem={renderMessageItem}
        scrollsToTop
        className="flex-1"
      />
    </ScrollShadow>
  );
}
