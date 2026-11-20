import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useNextFrame } from '@/frontend/hooks/useNextFrame';

export type MessageListInitialRenderGateOptions = {
  /** Identity of the rendered list; undefined while no list is shown. */
  renderGateKey: string | undefined;
  requiresInitialHistoryLayout: boolean;
};

type RenderToken = Readonly<{
  renderGateKey: string | undefined;
}>;

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
  const { schedule: scheduleReadyFrame, cancel: cancelReadyFrame } = useNextFrame();
  const [resolvedRenderToken, setResolvedRenderToken] = useState<RenderToken | null>(() =>
    requiresInitialHistoryLayout ? null : renderToken,
  );
  const isCoverVisible = requiresInitialHistoryLayout && resolvedRenderToken !== renderToken;

  useLayoutEffect(() => {
    activeRenderTokenRef.current = renderToken;
    if (requiresInitialHistoryLayout) {
      return;
    }

    scheduleReadyFrame(() => {
      if (activeRenderTokenRef.current === renderToken) {
        setResolvedRenderToken(renderToken);
      }
    });

    return cancelReadyFrame;
  }, [cancelReadyFrame, renderToken, requiresInitialHistoryLayout, scheduleReadyFrame]);

  useLayoutEffect(() => cancelReadyFrame, [cancelReadyFrame, renderToken]);

  const markListLoaded = useCallback(() => {
    scheduleReadyFrame(() => {
      if (activeRenderTokenRef.current === renderToken) {
        setResolvedRenderToken(renderToken);
      }
    });
  }, [renderToken, scheduleReadyFrame]);

  return { isCoverVisible, markListLoaded };
}
