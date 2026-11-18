import { useCallback, useState } from 'react';

import type { AgentSessionEntity } from '@/shared/data/api/schemas/agentSessions';
import type { UniqueModelId } from '@/shared/data/types/model';

type SessionModelSnapshot = Pick<AgentSessionEntity, 'model' | 'updatedAt'>;
type ModelSelection = { sessionId: string; modelId: UniqueModelId };
type PendingSelection = ModelSelection & { confirmedUpdatedAt?: string };

/** A choice stays visible while the session-scoped mutation and metadata read settle. */
export function useChatInputSessionModelSelection(
  sessionId: string | undefined,
  persisted: SessionModelSnapshot | undefined,
  persist: (sessionId: string, modelId: UniqueModelId) => Promise<SessionModelSnapshot>,
  onError: (error: unknown, selection: ModelSelection) => void,
) {
  const [selection, setSelection] = useState<PendingSelection>();
  let visible = selection?.sessionId === sessionId ? selection : undefined;
  if (
    visible?.confirmedUpdatedAt &&
    persisted &&
    persisted.updatedAt >= visible.confirmedUpdatedAt
  ) {
    visible = undefined;
    setSelection(undefined);
  }

  const selectModel = useCallback(
    (modelId: UniqueModelId) => {
      if (!sessionId) return;
      const next = { sessionId, modelId };
      setSelection(next);
      void persist(sessionId, modelId).then(
        (saved) => {
          setSelection((current) =>
            current === next ? { ...next, confirmedUpdatedAt: saved.updatedAt } : current,
          );
        },
        (error: unknown) => {
          setSelection((current) => (current === next ? undefined : current));
          onError(error, next);
        },
      );
    },
    [onError, persist, sessionId],
  );

  return {
    selectModel,
    pendingModelId: visible?.modelId,
    selectedModelId: visible?.modelId ?? persisted?.model ?? null,
  };
}
