import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { loggerService } from '@/shared/core/logger/LoggerService';

const gateLog = loggerService.withContext('ChatGate');

export type MessageListInitialRenderGateOptions = {
  renderGateKey: string;
  requiresInitialHistoryLayout: boolean;
};

type RenderToken = Readonly<{
  renderGateKey: string;
}>;

type PendingReadyFrame = {
  id: number;
  token: RenderToken;
};

type InitialHistoryLayoutOptions = {
  hasHistoryBeforeActiveTurn: boolean | undefined;
  isLoadingInitial: boolean;
  messageCount: number;
};

export function shouldWaitForInitialHistoryLayout({
  hasHistoryBeforeActiveTurn,
  isLoadingInitial,
  messageCount,
}: InitialHistoryLayoutOptions) {
  return hasHistoryBeforeActiveTurn !== false && (isLoadingInitial || messageCount > 0);
}

export function useMessageListInitialRenderGate({
  renderGateKey,
  requiresInitialHistoryLayout,
}: MessageListInitialRenderGateOptions) {
  const renderToken = useMemo<RenderToken>(() => ({ renderGateKey }), [renderGateKey]);
  const activeRenderTokenRef = useRef(renderToken);
  const pendingReadyFrameRef = useRef<PendingReadyFrame | null>(null);
  const [resolvedRenderToken, setResolvedRenderToken] = useState<RenderToken | null>(() =>
    requiresInitialHistoryLayout ? null : renderToken,
  );
  const isCoverVisible = requiresInitialHistoryLayout && resolvedRenderToken !== renderToken;

  useLayoutEffect(() => {
    activeRenderTokenRef.current = renderToken;
    if (requiresInitialHistoryLayout) {
      return;
    }

    const readyFrameId = requestAnimationFrame(() => {
      if (pendingReadyFrameRef.current?.id === readyFrameId) {
        pendingReadyFrameRef.current = null;
      }
      if (activeRenderTokenRef.current === renderToken) {
        setResolvedRenderToken(renderToken);
      }
    });
    pendingReadyFrameRef.current = { id: readyFrameId, token: renderToken };

    return () => {
      if (pendingReadyFrameRef.current?.id === readyFrameId) {
        cancelAnimationFrame(readyFrameId);
        pendingReadyFrameRef.current = null;
      }
    };
  }, [renderToken, requiresInitialHistoryLayout]);

  useLayoutEffect(() => {
    return () => {
      const pendingReadyFrame = pendingReadyFrameRef.current;
      if (pendingReadyFrame?.token === renderToken) {
        cancelAnimationFrame(pendingReadyFrame.id);
        pendingReadyFrameRef.current = null;
      }
    };
  }, [renderToken]);

  const markListLoaded = useCallback(() => {
    const pendingReadyFrame = pendingReadyFrameRef.current;
    if (pendingReadyFrame) {
      cancelAnimationFrame(pendingReadyFrame.id);
    }

    gateLog.debug('[GATE] markListLoaded(onReady)', { t: Date.now() });
    const readyFrameId = requestAnimationFrame(() => {
      if (pendingReadyFrameRef.current?.id === readyFrameId) {
        pendingReadyFrameRef.current = null;
      }
      gateLog.debug('[GATE] gateResolved(rAF)', { t: Date.now() });
      if (activeRenderTokenRef.current === renderToken) {
        setResolvedRenderToken(renderToken);
      }
    });
    pendingReadyFrameRef.current = { id: readyFrameId, token: renderToken };
  }, [renderToken]);

  return { isCoverVisible, markListLoaded };
}
