import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useSyncExternalStore,
} from 'react';

import type { AgentToolInputPreview } from '@/shared/contracts/agent';

export type ToolInputPreviewSource = {
  getSnapshot(messageId: string, toolCallId: string): AgentToolInputPreview | undefined;
  subscribe(messageId: string, toolCallId: string, listener: () => void): () => void;
};

const ToolInputPreviewContext = createContext<ToolInputPreviewSource | null>(null);

export function ToolInputPreviewProvider({
  children,
  source,
}: PropsWithChildren<{ source: ToolInputPreviewSource }>) {
  return <ToolInputPreviewContext value={source}>{children}</ToolInputPreviewContext>;
}

/** Preview ticks subscribe at the content leaf, independently of transcript/list updates. */
export function useToolInputPreview(messageId: string | undefined, toolCallId: string) {
  const source = use(ToolInputPreviewContext);
  const subscribe = useCallback(
    (listener: () => void) =>
      source && messageId ? source.subscribe(messageId, toolCallId, listener) : () => undefined,
    [messageId, source, toolCallId],
  );
  const getSnapshot = useCallback(
    () => (messageId ? source?.getSnapshot(messageId, toolCallId) : undefined),
    [messageId, source, toolCallId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
