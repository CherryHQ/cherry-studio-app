import type { LegendListRef } from '@legendapp/list/react-native';
import type { RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { useGenericKeyboardHandler } from 'react-native-keyboard-controller';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { cacheService } from '@/frontend/data/CacheService';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { ChatScrollAnchor } from '@/shared/data/cache/cacheSchemas';

import type { MessageListItem, MessageListProps } from '../types';
import { isMessageListAtBottom } from './messageListLayout';
import { computeScrollAnchor, resolveRestoreTarget } from './messageListScrollMemory';
import {
  type FollowingReason,
  type ReadingReason,
  useViewportFollowState,
} from './useViewportFollowState';

const SAVE_THROTTLE_MS = 200;
const scrollLog = loggerService.withContext('ChatScroll');

type MessageListScrollControllerInputs = {
  contentTopInset: number;
  dataKey: string | undefined;
  enteringMessageId: string | undefined;
  initialLayoutReady: boolean;
  initialScrollTarget?: MessageListProps['initialScrollTarget'];
  hasNewerMessages: boolean;
  listRef: RefObject<LegendListRef | null>;
  messages: readonly MessageListItem[];
  onReady: (() => void) | undefined;
  onTargetRestored?: MessageListProps['onTargetRestored'];
  onReturnToLatest?: () => void;
};

type ObservedScrollAnchor = Readonly<{
  anchor: ChatScrollAnchor;
  dataKey: string;
}>;

function cacheKeyFor(dataKey: string): `chat.scroll_anchor.${string}` {
  return `chat.scroll_anchor.${dataKey}`;
}

export function useMessageListScrollController(inputs: MessageListScrollControllerInputs) {
  const inputsRef = useRef(inputs);
  const { controller: follow, isFollowingForRender } = useViewportFollowState();
  const isKeyboardTransitioning = useSharedValue(false);
  const activeDataKeyRef = useRef<string | undefined>(inputs.dataKey);
  const didListLoadRef = useRef(false);
  const didRestoreRef = useRef(false);
  const suppressSaveRef = useRef(true);
  const restoreGenerationRef = useRef(0);
  const lastSaveAtRef = useRef(0);
  const readyFrameRef = useRef<number | null>(null);
  const sendFrameRef = useRef<number | null>(null);
  const stickFrameRef = useRef<number | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const viewportWidthRef = useRef<number | null>(null);
  const liveEdgeScrollCountRef = useRef(0);
  const needsStickAfterScrollRef = useRef(false);
  const isMomentumScrollingRef = useRef(false);
  const userInteractionGenerationRef = useRef<number | null>(null);
  const observedScrollAnchorRef = useRef<ObservedScrollAnchor | null>(null);
  const processedEnteringMessageIdRef = useRef(inputs.enteringMessageId);
  const pendingEnteringMessageIdRef = useRef<string | undefined>(undefined);

  const clearStoredAnchor = useCallback(() => {
    const dataKey = inputsRef.current.dataKey;
    if (dataKey) {
      observedScrollAnchorRef.current = { anchor: null, dataKey };
      cacheService.set(cacheKeyFor(dataKey), null);
    }
  }, []);

  const flushObservedScrollAnchor = useCallback((dataKey: string | undefined) => {
    const observed = observedScrollAnchorRef.current;
    if (dataKey && observed?.dataKey === dataKey) {
      cacheService.set(cacheKeyFor(dataKey), observed.anchor);
    }
  }, []);

  const cancelScheduledStick = useCallback(() => {
    if (stickFrameRef.current !== null) {
      cancelAnimationFrame(stickFrameRef.current);
      stickFrameRef.current = null;
    }
  }, []);

  const scheduleStickToBottom = useCallback(() => {
    if (liveEdgeScrollCountRef.current > 0 || sendFrameRef.current !== null) {
      needsStickAfterScrollRef.current = true;
      return;
    }

    if (stickFrameRef.current !== null) {
      return;
    }

    const generation = restoreGenerationRef.current;
    stickFrameRef.current = requestAnimationFrame(() => {
      stickFrameRef.current = null;
      if (
        generation !== restoreGenerationRef.current ||
        !follow.isFollowing() ||
        isKeyboardTransitioning.get()
      ) {
        return;
      }

      const list = inputsRef.current.listRef.current;
      if (list) {
        void list.scrollToEnd({ animated: false });
      }
    });
  }, [follow, isKeyboardTransitioning]);

  const scrollToLiveEdge = useCallback(
    async (reason: FollowingReason | 'local-send', options: { animated: boolean }) => {
      // Sending positions the new turn once; its growing reply must not pull
      // the reader down or queue another end correction during this scroll.
      if (reason === 'local-send') follow.enterReading(reason);
      else follow.enterFollowing(reason);
      // Native momentum events from this programmatic scroll must not complete
      // an earlier drag and accidentally opt the reader back into following.
      isMomentumScrollingRef.current = false;
      userInteractionGenerationRef.current = null;
      clearStoredAnchor();
      liveEdgeScrollCountRef.current += 1;

      try {
        const current = inputsRef.current;
        if (current.onReturnToLatest) {
          current.onReturnToLatest();
        } else {
          const list = current.listRef.current;
          const state = list?.getState();
          // A no-op native animation may never report completion, which would
          // leave later content growth waiting on liveEdgeScrollCountRef forever.
          const isAtBottom =
            state && isMessageListAtBottom(state.scroll, state.contentLength, state.scrollLength);
          await list?.scrollToEnd({
            animated: options.animated && !isAtBottom,
          });
        }
      } catch (error) {
        scrollLog.warn('[SCROLL] liveEdgeScroll failed', error as Error, { reason });
      } finally {
        liveEdgeScrollCountRef.current = Math.max(0, liveEdgeScrollCountRef.current - 1);
        if (liveEdgeScrollCountRef.current === 0 && needsStickAfterScrollRef.current) {
          needsStickAfterScrollRef.current = false;
          scheduleStickToBottom();
        }
      }
    },
    [clearStoredAnchor, follow, scheduleStickToBottom],
  );

  /** Keeps the live edge exact whenever the viewport is in following mode. */
  const stickToBottomIfFollowing = useCallback(() => {
    if (follow.isFollowing()) {
      scheduleStickToBottom();
    }
  }, [follow, scheduleStickToBottom]);

  const saveScrollAnchor = useCallback(
    (immediate = false) => {
      const current = inputsRef.current;
      if (suppressSaveRef.current || !current.dataKey) {
        return;
      }

      let anchor: ChatScrollAnchor;
      if (follow.isFollowing()) {
        anchor = null;
      } else {
        const state = current.listRef.current?.getState();
        if (!state || state.start < 0) {
          return;
        }

        anchor = computeScrollAnchor({
          getKeyAtIndex: (index) => current.messages[index]?.id ?? null,
          getOffsetAtIndex: (index) => state.positionAtIndex(index),
          scrollOffset: state.scroll,
          topIndex: state.start,
        });
      }
      // Capture every native update even when the cache write is throttled, so a
      // dataset switch can flush the outgoing viewport without reading the new list.
      observedScrollAnchorRef.current = { anchor, dataKey: current.dataKey };

      const now = Date.now();
      if (!immediate && now - lastSaveAtRef.current < SAVE_THROTTLE_MS) {
        return;
      }
      lastSaveAtRef.current = now;
      cacheService.set(cacheKeyFor(current.dataKey), anchor);
    },
    [follow],
  );

  useLayoutEffect(() => {
    const previousDataKey = activeDataKeyRef.current;
    if (previousDataKey === inputs.dataKey) {
      inputsRef.current = inputs;
      return;
    }

    flushObservedScrollAnchor(previousDataKey);
    activeDataKeyRef.current = inputs.dataKey;
    inputsRef.current = inputs;
    didRestoreRef.current = false;
    suppressSaveRef.current = true;
    lastSaveAtRef.current = 0;
    restoreGenerationRef.current += 1;
    // Native momentum callbacks from the outgoing dataset may arrive after the
    // new props commit. They no longer own this controller generation.
    isMomentumScrollingRef.current = false;
    userInteractionGenerationRef.current = null;
    observedScrollAnchorRef.current = null;
    needsStickAfterScrollRef.current = false;
    processedEnteringMessageIdRef.current = inputs.enteringMessageId;
    pendingEnteringMessageIdRef.current = undefined;
    follow.enterReading('navigation');
  }, [flushObservedScrollAnchor, follow, inputs]);

  const scheduleLocalSendScroll = useCallback(
    (messageId: string) => {
      pendingEnteringMessageIdRef.current = messageId;
      const current = inputsRef.current;
      // Send intent precedes the transcript update. Keep the reader's position
      // until the target exists, unless navigation must first load the live edge.
      if (
        (!current.onReturnToLatest &&
          !current.messages.some((message) => message.id === messageId)) ||
        isKeyboardTransitioning.get()
      ) {
        return;
      }
      processedEnteringMessageIdRef.current = messageId;
      follow.enterReading('local-send');
      clearStoredAnchor();
      cancelScheduledStick();

      if (sendFrameRef.current !== null) {
        cancelAnimationFrame(sendFrameRef.current);
      }
      const generation = restoreGenerationRef.current;
      sendFrameRef.current = requestAnimationFrame(() => {
        sendFrameRef.current = null;
        if (
          generation !== restoreGenerationRef.current ||
          pendingEnteringMessageIdRef.current !== messageId
        ) {
          return;
        }
        // Keyboard dismissal can start after this frame was queued.
        if (isKeyboardTransitioning.get()) {
          return;
        }
        pendingEnteringMessageIdRef.current = undefined;
        void scrollToLiveEdge('local-send', { animated: true });
      });
    },
    [cancelScheduledStick, clearStoredAnchor, follow, isKeyboardTransitioning, scrollToLiveEdge],
  );

  const handleKeyboardEnd = useCallback(() => {
    const pendingMessageId = pendingEnteringMessageIdRef.current;
    if (pendingMessageId && didRestoreRef.current) {
      scheduleLocalSendScroll(pendingMessageId);
    } else {
      stickToBottomIfFollowing();
    }
  }, [scheduleLocalSendScroll, stickToBottomIfFollowing]);

  // The native keyboard adapter owns scrolling during its animation. A send
  // waiting for dismissal takes precedence over the ordinary layout correction.
  useGenericKeyboardHandler(
    {
      onStart: () => {
        'worklet';
        isKeyboardTransitioning.set(true);
      },
      onInteractive: () => {
        'worklet';
        isKeyboardTransitioning.set(true);
      },
      onEnd: () => {
        'worklet';
        isKeyboardTransitioning.set(false);
        runOnJS(handleKeyboardEnd)();
      },
    },
    [handleKeyboardEnd, isKeyboardTransitioning],
  );

  const reportReadyAfterRestore = useCallback(
    (generation: number, shouldReportReady = true, restoredMessageId?: string) => {
      if (generation !== restoreGenerationRef.current) {
        return;
      }
      if (readyFrameRef.current !== null) {
        cancelAnimationFrame(readyFrameRef.current);
      }
      readyFrameRef.current = requestAnimationFrame(() => {
        readyFrameRef.current = null;
        if (generation !== restoreGenerationRef.current) {
          return;
        }

        suppressSaveRef.current = false;
        const current = inputsRef.current;
        if (
          restoredMessageId &&
          current.dataKey &&
          current.initialLayoutReady &&
          current.messages.some((message) => message.id === restoredMessageId)
        )
          current.onTargetRestored?.({ dataKey: current.dataKey, messageId: restoredMessageId });
        if (shouldReportReady) current.onReady?.();
        const pendingMessageId = pendingEnteringMessageIdRef.current;
        if (pendingMessageId) {
          scheduleLocalSendScroll(pendingMessageId);
        }
      });
    },
    [scheduleLocalSendScroll],
  );

  const attemptRestore = useCallback(() => {
    const current = inputsRef.current;
    if (didRestoreRef.current || !didListLoadRef.current || !current.initialLayoutReady) {
      return;
    }

    const list = current.listRef.current;
    if (!list) {
      return;
    }

    didRestoreRef.current = true;
    const generation = restoreGenerationRef.current;
    if (current.messages.length === 0) {
      follow.enterFollowing('restored-bottom');
      reportReadyAfterRestore(generation);
      return;
    }

    const pendingMessageId = pendingEnteringMessageIdRef.current;
    if (!current.dataKey && !pendingMessageId) {
      // Stateless consumers use LegendList's initialScrollAtEnd bootstrap so
      // their first visible frame is already correct. The controller adopts
      // following mode without issuing a second initial scroll.
      follow.enterFollowing('restored-bottom');
      reportReadyAfterRestore(generation);
      return;
    }

    const explicitTarget = current.initialScrollTarget;
    const saved =
      pendingMessageId || explicitTarget === 'end'
        ? null
        : explicitTarget
          ? { key: explicitTarget.messageId, offset: -current.contentTopInset }
          : current.dataKey
            ? cacheService.get(cacheKeyFor(current.dataKey))
            : null;
    if (
      current.onTargetRestored &&
      explicitTarget &&
      explicitTarget !== 'end' &&
      !current.messages.some((message) => message.id === explicitTarget.messageId)
    ) {
      reportReadyAfterRestore(generation);
      return;
    }
    const target = resolveRestoreTarget(
      saved,
      (key) => current.messages.findIndex((message) => message.id === key),
      current.messages.length - 1,
    );

    let restore: Promise<void>;
    if (target.align === 'start') {
      follow.enterReading('restored-anchor');
      restore = list.scrollToIndex({
        animated: false,
        index: target.index,
        viewOffset: -target.offset,
        viewPosition: 0,
      });
    } else {
      const enteringMessageId = pendingMessageId ?? current.enteringMessageId;
      if (enteringMessageId) {
        processedEnteringMessageIdRef.current = enteringMessageId;
        pendingEnteringMessageIdRef.current = undefined;
      }
      restore = scrollToLiveEdge(enteringMessageId ? 'local-send' : 'restored-bottom', {
        // Initial placement is hidden by the history cover. Android may not
        // emit an animation completion event when this target is already reached.
        animated: false,
      });
    }

    void restore.then(
      () =>
        reportReadyAfterRestore(
          generation,
          true,
          target.align === 'start' && explicitTarget && explicitTarget !== 'end'
            ? explicitTarget.messageId
            : undefined,
        ),
      () => reportReadyAfterRestore(generation),
    );
  }, [follow, reportReadyAfterRestore, scrollToLiveEdge]);

  useEffect(() => {
    attemptRestore();
  }, [attemptRestore, inputs.dataKey, inputs.initialLayoutReady, inputs.messages.length]);

  useEffect(() => {
    const enteringMessageId = inputs.enteringMessageId;
    if (!enteringMessageId || processedEnteringMessageIdRef.current === enteringMessageId) {
      return;
    }

    if (!didRestoreRef.current) {
      pendingEnteringMessageIdRef.current = enteringMessageId;
      attemptRestore();
      return;
    }

    scheduleLocalSendScroll(enteringMessageId);
  }, [attemptRestore, inputs.enteringMessageId, inputs.messages, scheduleLocalSendScroll]);

  const handleLoad = useCallback(() => {
    didListLoadRef.current = true;
    attemptRestore();
  }, [attemptRestore]);

  const handleContentSizeChange = useCallback(() => {
    stickToBottomIfFollowing();
  }, [stickToBottomIfFollowing]);

  // Height changes only move the live edge. A width change also reflows earlier messages, so
  // readers restore the last observed row and offset before native scroll updates replace it.
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      const previousWidth = viewportWidthRef.current;
      if (width > 0) viewportWidthRef.current = width;
      stickToBottomIfFollowing();

      const observed = observedScrollAnchorRef.current;
      if (
        width <= 0 ||
        previousWidth === null ||
        width === previousWidth ||
        follow.isFollowing() ||
        !observed?.anchor ||
        observed.dataKey !== inputsRef.current.dataKey
      ) {
        return;
      }

      const generation = ++restoreGenerationRef.current;
      suppressSaveRef.current = true;
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        if (generation !== restoreGenerationRef.current) return;
        if (follow.isFollowing()) {
          reportReadyAfterRestore(generation, false);
          return;
        }
        const current = inputsRef.current;
        const list = current.listRef.current;
        const target = resolveRestoreTarget(
          observed.anchor,
          (key) => current.messages.findIndex((message) => message.id === key),
          current.messages.length - 1,
        );
        const complete = () => reportReadyAfterRestore(generation, false);
        if (!list || target.align !== 'start') {
          complete();
          return;
        }
        void list
          .scrollToIndex({
            animated: false,
            index: target.index,
            viewOffset: -target.offset,
            viewPosition: 0,
          })
          .then(complete, complete);
      });
    },
    [follow, reportReadyAfterRestore, stickToBottomIfFollowing],
  );

  const enterReadingForUser = useCallback(
    (reason: ReadingReason) => {
      cancelScheduledStick();
      if (pendingEnteringMessageIdRef.current) {
        processedEnteringMessageIdRef.current = pendingEnteringMessageIdRef.current;
        pendingEnteringMessageIdRef.current = undefined;
      }
      follow.enterReading(reason);
      if (suppressSaveRef.current) {
        // A committed interaction outranks initial placement and width restoration. Invalidate
        // any pending restore completion, reveal the list, and let MVCP preserve
        // the position when late history arrives.
        didRestoreRef.current = true;
        restoreGenerationRef.current += 1;
        suppressSaveRef.current = false;
        reportReadyAfterRestore(restoreGenerationRef.current);
      }
    },
    [cancelScheduledStick, follow, reportReadyAfterRestore],
  );

  const handleDisclosureToggle = useCallback(() => {
    enterReadingForUser('user-toggled-disclosure');
  }, [enterReadingForUser]);

  const finishUserScroll = useCallback(() => {
    const state = inputsRef.current.listRef.current?.getState();
    // LegendList's isAtEnd excludes the keyboard inset from its edge check.
    const isAtEnd =
      state && isMessageListAtBottom(state.scroll, state.contentLength, state.scrollLength);
    if (isAtEnd && !inputsRef.current.hasNewerMessages) {
      follow.enterFollowing('user-reached-bottom');
      clearStoredAnchor();
    } else {
      follow.enterReading('user-scrolled-up');
    }
    saveScrollAnchor(true);
  }, [clearStoredAnchor, follow, saveScrollAnchor]);

  const handleScrollBeginDrag = useCallback(() => {
    enterReadingForUser('user-scrolled-up');
    userInteractionGenerationRef.current = restoreGenerationRef.current;
  }, [enterReadingForUser]);

  const handleScrollEndDrag = useCallback(() => {
    if (userInteractionGenerationRef.current !== restoreGenerationRef.current) {
      return;
    }
    finishUserScroll();
  }, [finishUserScroll]);

  const handleMomentumScrollBegin = useCallback(() => {
    if (userInteractionGenerationRef.current !== restoreGenerationRef.current) {
      return;
    }
    isMomentumScrollingRef.current = true;
  }, []);

  const handleMomentumScrollEnd = useCallback(() => {
    if (
      !isMomentumScrollingRef.current ||
      userInteractionGenerationRef.current !== restoreGenerationRef.current
    ) {
      return;
    }
    isMomentumScrollingRef.current = false;
    userInteractionGenerationRef.current = null;
    finishUserScroll();
  }, [finishUserScroll]);

  const handleTouchStart = useCallback(() => {
    if (isMomentumScrollingRef.current) {
      enterReadingForUser('user-scrolled-up');
    }
  }, [enterReadingForUser]);

  const handleScroll = useCallback(
    (_event: NativeSyntheticEvent<NativeScrollEvent>) => {
      saveScrollAnchor();
    },
    [saveScrollAnchor],
  );

  const handleScrollToEnd = useCallback(() => {
    void scrollToLiveEdge('scroll-to-bottom', { animated: true });
  }, [scrollToLiveEdge]);

  useEffect(() => {
    return () => {
      saveScrollAnchor(true);
      flushObservedScrollAnchor(activeDataKeyRef.current);
      restoreGenerationRef.current += 1;
      for (const frame of [readyFrameRef, sendFrameRef, stickFrameRef, resizeFrameRef]) {
        if (frame.current !== null) {
          cancelAnimationFrame(frame.current);
          frame.current = null;
        }
      }
    };
  }, [flushObservedScrollAnchor, saveScrollAnchor]);

  return {
    handleContentSizeChange,
    handleDisclosureToggle,
    handleLayout,
    handleLoad,
    handleMomentumScrollBegin,
    handleMomentumScrollEnd,
    handleScroll,
    handleScrollBeginDrag,
    handleScrollEndDrag,
    handleScrollToEnd,
    handleTouchStart,
    isFollowing: isFollowingForRender,
  };
}
