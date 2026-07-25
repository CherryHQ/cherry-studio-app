import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { loggerService } from '@/core/logger/LoggerService';

// 诊断埋点：冷/暖首次进入 topic 的遮罩 gate 时序（onReady 到达 → 撤遮罩），用于定位
// 「reload 后第一次进入才跳」——差异在遮罩揭示相对内容 settle 的时机。`[GATE]` 前缀。
const gateLog = loggerService.withContext('ChatGate');

export type MessageListInitialRenderGateOptions = {
  renderGateKey: string;
  requiresInitialHistoryLayout: boolean;
};

type MessageListInitialRenderGateState = {
  isResolved: boolean;
  renderGateKey: string;
};

type PendingReadyFrame = {
  id: number;
  renderGateKey: string;
};

type InitialHistoryLayoutOptions = {
  hasHistoryBeforePendingTurn: boolean | undefined;
  isLoadingInitial: boolean;
  messageCount: number;
};

export function shouldWaitForInitialHistoryLayout({
  hasHistoryBeforePendingTurn,
  isLoadingInitial,
  messageCount,
}: InitialHistoryLayoutOptions) {
  return hasHistoryBeforePendingTurn !== false && (isLoadingInitial || messageCount > 0);
}

export function useMessageListInitialRenderGate({
  renderGateKey,
  requiresInitialHistoryLayout,
}: MessageListInitialRenderGateOptions) {
  const pendingReadyFrameRef = useRef<PendingReadyFrame | null>(null);
  const [gateState, setGateState] = useState<MessageListInitialRenderGateState>(() => ({
    isResolved: !requiresInitialHistoryLayout,
    renderGateKey,
  }));

  let currentGateState = gateState;
  if (gateState.renderGateKey !== renderGateKey) {
    currentGateState = {
      isResolved: !requiresInitialHistoryLayout,
      renderGateKey,
    };
    setGateState(currentGateState);
  } else if (!requiresInitialHistoryLayout && !gateState.isResolved) {
    currentGateState = { ...gateState, isResolved: true };
    setGateState(currentGateState);
  }

  const isCoverVisible = requiresInitialHistoryLayout && !currentGateState.isResolved;

  useLayoutEffect(() => {
    return () => {
      const pendingReadyFrame = pendingReadyFrameRef.current;
      if (pendingReadyFrame?.renderGateKey === renderGateKey) {
        cancelAnimationFrame(pendingReadyFrame.id);
        pendingReadyFrameRef.current = null;
      }
    };
  }, [renderGateKey]);

  const markListLoaded = useCallback(() => {
    const loadedListRenderKey = renderGateKey;

    gateLog.debug('[GATE] markListLoaded(onReady)', { t: Date.now() });
    const readyFrameId = requestAnimationFrame(() => {
      if (pendingReadyFrameRef.current?.id === readyFrameId) {
        pendingReadyFrameRef.current = null;
      }
      gateLog.debug('[GATE] gateResolved(rAF)->撤遮罩', { t: Date.now() });
      setGateState((current) => {
        if (current.renderGateKey !== loadedListRenderKey || current.isResolved) {
          return current;
        }

        return { ...current, isResolved: true };
      });
    });
    pendingReadyFrameRef.current = { id: readyFrameId, renderGateKey: loadedListRenderKey };
  }, [renderGateKey]);

  return {
    isCoverVisible,
    listRenderKey: renderGateKey,
    markListLoaded,
  };
}
