import { useCallback, useState } from 'react';

import { loggerService } from '@/core/logger/LoggerService';

// 诊断埋点：冷/暖首次进入 topic 的遮罩 gate 时序（onReady 到达 → 撤遮罩），用于定位
// 「reload 后第一次进入才跳」——差异在遮罩揭示相对内容 settle 的时机。`[GATE]` 前缀。
const gateLog = loggerService.withContext('ChatGate');

type MessageListInitialRenderGateOptions = {
  hasMessages: boolean;
  isLoadingInitial: boolean;
  renderGateKey: string;
};

export function useMessageListInitialRenderGate({
  hasMessages,
  isLoadingInitial,
  renderGateKey,
}: MessageListInitialRenderGateOptions) {
  const [readyListRenderKey, setReadyListRenderKey] = useState<string | null>(null);
  const isCoverVisible = isLoadingInitial || (hasMessages && readyListRenderKey !== renderGateKey);

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
