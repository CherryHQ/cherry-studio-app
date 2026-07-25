import { useCallback, useState } from 'react';

import { loggerService } from '@/core/logger/LoggerService';

// 诊断埋点：冷/暖首次进入 topic 的遮罩 gate 时序（onReady 到达 → 撤遮罩），用于定位
// 「reload 后第一次进入才跳」——差异在遮罩揭示相对内容 settle 的时机。`[GATE]` 前缀。
const gateLog = loggerService.withContext('ChatGate');

export type MessageListInitialRenderGateOptions = {
  hasMessages: boolean;
  /**
   * True when the list already has something to draw that did not come from the
   * message query: the user message handed over from a just-created topic. There
   * `isLoadingInitial` only reflects the brand-new query key — covering the list
   * would hide the message the user just sent, right when it should stay put and
   * let the reply stream into the space below it.
   */
  isHandedOverFromNewTopic: boolean;
  isLoadingInitial: boolean;
  renderGateKey: string;
};

export function useMessageListInitialRenderGate({
  hasMessages,
  isHandedOverFromNewTopic,
  isLoadingInitial,
  renderGateKey,
}: MessageListInitialRenderGateOptions) {
  const [readyListRenderKey, setReadyListRenderKey] = useState<string | null>(null);
  const isCoverVisible =
    !isHandedOverFromNewTopic &&
    (isLoadingInitial || (hasMessages && readyListRenderKey !== renderGateKey));

  const markListLoaded = useCallback(() => {
    const loadedListRenderKey = renderGateKey;

    gateLog.debug('[GATE] markListLoaded(onReady)', { t: Date.now() });
    requestAnimationFrame(() => {
      gateLog.debug('[GATE] coverKeySet(rAF)->撤遮罩', { t: Date.now() });
      setReadyListRenderKey(loadedListRenderKey);
    });
  }, [renderGateKey]);

  return {
    isCoverVisible,
    listRenderKey: renderGateKey,
    markListLoaded,
  };
}
