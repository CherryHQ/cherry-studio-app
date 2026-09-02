import { useCallback, useRef, useState } from 'react';

import type { Agent } from '@/shared/data/types/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

type AgentModelSnapshot = Pick<Agent, 'modelId' | 'updatedAt'>;

type ModelSelectionOverride = {
  agentId: string;
  confirmedUpdatedAt: string | null;
  fallback: AgentModelSnapshot | undefined;
  modelId: UniqueModelId | null;
  selectionId: number;
};

type DesiredModelSelection = Omit<ModelSelectionOverride, 'modelId'> & {
  modelId: UniqueModelId;
};

type PersistModelSelection = (
  agentId: string,
  modelId: UniqueModelId,
) => Promise<AgentModelSnapshot>;

type ModelPersistenceErrorHandler = (
  error: unknown,
  selection: Pick<DesiredModelSelection, 'agentId' | 'modelId'>,
) => void;

/**
 * Keeps a picked model visible while the Agent mutation and query refresh
 * settle. The persisted Agent remains authoritative once it catches up.
 */
export function useChatInputAgentModelSelection(
  agentId: string | undefined,
  persistedModel: AgentModelSnapshot | undefined,
  persistModel: PersistModelSelection,
  onPersistenceError?: ModelPersistenceErrorHandler,
) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, ModelSelectionOverride>>(
    () => new Map(),
  );
  const desiredSelectionsRef = useRef(new Map<string, DesiredModelSelection>());
  const pendingAgentIdsRef = useRef<string[]>([]);
  const isPersistingRef = useRef(false);
  const nextSelectionIdRef = useRef(0);

  let activeOverride = agentId ? overrides.get(agentId) : undefined;
  if (
    agentId &&
    activeOverride?.confirmedUpdatedAt &&
    persistedModel &&
    persistedModel.updatedAt >= activeOverride.confirmedUpdatedAt
  ) {
    const confirmedSelectionId = activeOverride.selectionId;
    activeOverride = undefined;

    setOverrides((current) => {
      if (current.get(agentId)?.selectionId !== confirmedSelectionId) {
        return current;
      }

      const next = new Map(current);
      next.delete(agentId);
      return next;
    });
  }

  const flushSelections = useCallback(() => {
    if (isPersistingRef.current) {
      return;
    }

    isPersistingRef.current = true;
    void (async () => {
      try {
        while (pendingAgentIdsRef.current.length > 0) {
          const targetAgentId = pendingAgentIdsRef.current[0];
          const target = desiredSelectionsRef.current.get(targetAgentId);
          if (!target) {
            pendingAgentIdsRef.current.shift();
            continue;
          }

          try {
            const confirmedModel = await persistModel(target.agentId, target.modelId);
            const latest = desiredSelectionsRef.current.get(targetAgentId);
            if (latest?.modelId === target.modelId) {
              desiredSelectionsRef.current.delete(targetAgentId);
              pendingAgentIdsRef.current.shift();
              setOverrides((current) => {
                if (current.get(targetAgentId)?.selectionId !== latest.selectionId) {
                  return current;
                }

                const next = new Map(current);
                next.set(targetAgentId, {
                  ...latest,
                  confirmedUpdatedAt: confirmedModel.updatedAt,
                  modelId: confirmedModel.modelId,
                });
                return next;
              });
            } else if (latest) {
              desiredSelectionsRef.current.set(targetAgentId, {
                ...latest,
                fallback: confirmedModel,
              });
            }
          } catch (error) {
            if (
              desiredSelectionsRef.current.get(targetAgentId)?.selectionId === target.selectionId
            ) {
              desiredSelectionsRef.current.delete(targetAgentId);
              pendingAgentIdsRef.current.shift();
              setOverrides((current) => {
                if (current.get(targetAgentId)?.selectionId !== target.selectionId) {
                  return current;
                }

                const next = new Map(current);
                if (target.fallback) {
                  next.set(targetAgentId, {
                    agentId: targetAgentId,
                    confirmedUpdatedAt: target.fallback.updatedAt,
                    fallback: target.fallback,
                    modelId: target.fallback.modelId,
                    selectionId: target.selectionId,
                  });
                } else {
                  next.delete(targetAgentId);
                }
                return next;
              });
            }
            onPersistenceError?.(error, target);
            continue;
          }
        }
      } finally {
        isPersistingRef.current = false;
      }
    })();
  }, [onPersistenceError, persistModel]);

  const selectModel = useCallback(
    (modelId: UniqueModelId) => {
      if (!agentId) {
        return;
      }

      const pendingSelection = desiredSelectionsRef.current.get(agentId);
      const selection = {
        agentId,
        confirmedUpdatedAt: null,
        fallback:
          pendingSelection?.fallback ??
          (activeOverride?.confirmedUpdatedAt
            ? { modelId: activeOverride.modelId, updatedAt: activeOverride.confirmedUpdatedAt }
            : persistedModel),
        modelId,
        selectionId: ++nextSelectionIdRef.current,
      };
      if (!desiredSelectionsRef.current.has(agentId)) {
        pendingAgentIdsRef.current.push(agentId);
      }
      desiredSelectionsRef.current.set(agentId, selection);
      setOverrides((current) => {
        const next = new Map(current);
        next.set(agentId, selection);
        return next;
      });
      flushSelections();
    },
    [activeOverride, agentId, flushSelections, persistedModel],
  );

  return {
    selectModel,
    selectedModelId: activeOverride ? activeOverride.modelId : (persistedModel?.modelId ?? null),
  };
}
