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
    async (reason: FollowingReason, options: { animated: boolean }) => {
      follow.enterFollowing(reason);
      clearStoredAnchor();
      liveEdgeScrollCountRef.current += 1;

      try {
        const current = inputsRef.current;
        if (current.onReturnToLatest) {
          current.onReturnToLatest();
        } else {
          await current.listRef.current?.scrollToEnd({
            animated: options.animated,
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

  // The native keyboard adapter owns scrolling during its animation. Layout
  // changes from the composer settle through one correction after it finishes.
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
        runOnJS(stickToBottomIfFollowing)();
      },
    },
    [isKeyboardTransitioning, stickToBottomIfFollowing],
  );

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
      processedEnteringMessageIdRef.current = messageId;
      pendingEnteringMessageIdRef.current = undefined;
      follow.enterFollowing('local-send');
      clearStoredAnchor();
      cancelScheduledStick();

      if (sendFrameRef.current !== null) {
        cancelAnimationFrame(sendFrameRef.current);
      }
      const generation = restoreGenerationRef.current;
      sendFrameRef.current = requestAnimationFrame(() => {
        sendFrameRef.current = null;
        if (generation !== restoreGenerationRef.current || !follow.isFollowing()) {
          return;
        }
        void scrollToLiveEdge('local-send', { animated: true });
      });
    },
    [cancelScheduledStick, clearStoredAnchor, follow, scrollToLiveEdge],
  );

  const reportReadyAfterRestore = useCallback(
    (generation: number) => {
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
        inputsRef.current.onReady?.();
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
      restore = scrollToLiveEdge(pendingMessageId ? 'local-send' : 'restored-bottom', {
        animated: Boolean(pendingMessageId),
      });
    }

    void restore.then(
      () => reportReadyAfterRestore(generation),
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
  }, [attemptRestore, inputs.enteringMessageId, scheduleLocalSendScroll]);

  const handleLoad = useCallback(() => {
    didListLoadRef.current = true;
    attemptRestore();
  }, [attemptRestore]);

  const handleContentSizeChange = useCallback(() => {
    stickToBottomIfFollowing();
  }, [stickToBottomIfFollowing]);

  // A viewport resize (keyboard, rotation) moves the live edge without changing
  // content size, so it needs the same correction from its own native callback.
  const handleLayout = useCallback(
    (_event: LayoutChangeEvent) => {
      stickToBottomIfFollowing();
    },
    [stickToBottomIfFollowing],
  );

  const enterReadingForUser = useCallback(
    (reason: ReadingReason) => {
      cancelScheduledStick();
      follow.enterReading(reason);
      if (suppressSaveRef.current) {
        // A committed interaction outranks mount-time restoration. Invalidate
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
      for (const frame of [readyFrameRef, sendFrameRef, stickFrameRef]) {
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
