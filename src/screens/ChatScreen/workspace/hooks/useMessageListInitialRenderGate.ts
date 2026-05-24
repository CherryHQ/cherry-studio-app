import { useCallback, useState } from 'react';

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
  const listRenderKey = `${renderGateKey}:${hasMessages ? 'messages' : 'empty'}`;
  const isCoverVisible = isLoadingInitial || (hasMessages && readyListRenderKey !== listRenderKey);

  const markListLoaded = useCallback(() => {
    const loadedListRenderKey = listRenderKey;

    requestAnimationFrame(() => {
      setReadyListRenderKey(loadedListRenderKey);
    });
  }, [listRenderKey]);

  return {
    isCoverVisible,
    listRenderKey,
    markListLoaded,
  };
}
