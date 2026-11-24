import {
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  TeamAgentDetail,
  TeamAgentModule,
  TeamSubmission,
} from '@/shared/contracts/teamAgent';

/** Refreshes the Team Agent directory when the active enterprise context changes. */
export function useTeamDirectorySync(
  module: TeamAgentModule,
  contextKey: string | undefined,
): void {
  useEffect(() => {
    void module.refresh().catch(() => {});
  }, [module, contextKey]);
}

/** Reads an optional portrait data URL for the active Team Agent, aborting stale reads. */
export function useTeamAgentPortrait(
  module: TeamAgentModule,
  agentId: string | undefined,
): string | undefined {
  const [portraitResult, setPortraitResult] = useState<{ id: string; uri?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    if (agentId)
      void module
        .readPortrait(agentId, controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) setPortraitResult({ id: agentId, uri: value });
        })
        .catch(() => {});
    return () => controller.abort();
  }, [module, agentId]);
  return agentId && portraitResult?.id === agentId ? portraitResult.uri : undefined;
}

/** Loads readonly Team Agent model, skill, and MCP details with retry support. */
export function useTeamAgentDetail(
  module: TeamAgentModule,
  agentId: string,
): { detail?: TeamAgentDetail; error: boolean; retry: () => void } {
  const [result, setResult] = useState<{
    key: string;
    detail?: TeamAgentDetail;
    error?: boolean;
  }>();
  const [attempt, setAttempt] = useState(0);
  const requestKey = JSON.stringify([agentId, attempt]);
  useEffect(() => {
    const lifetime = new AbortController();
    void module.readDetail(agentId, lifetime.signal).then(
      (detail) => {
        if (!lifetime.signal.aborted) setResult({ key: requestKey, detail });
      },
      () => {
        if (!lifetime.signal.aborted) setResult({ key: requestKey, error: true });
      },
    );
    return () => lifetime.abort();
  }, [module, agentId, requestKey]);
  const current = result?.key === requestKey ? result : undefined;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    detail: current?.detail,
    error: Boolean(current?.error),
    retry,
  };
}

/** Synchronizes the in-memory Team draft buffer and tracks mount lifetime for submissions. */
export function useTeamComposerDraft({
  module,
  draftKey,
  draft,
  setDraft,
  accepted,
}: {
  module: TeamAgentModule;
  draftKey: string;
  draft: string;
  setDraft: (next: SetStateAction<string>) => void;
  accepted?: TeamSubmission;
}): RefObject<boolean> {
  const lifetime = useRef(false);
  useEffect(() => {
    lifetime.current = true;
    return () => {
      lifetime.current = false;
    };
  }, []);
  useEffect(() => {
    module.writeDraft(draftKey, draft);
  }, [module, draftKey, draft]);
  useEffect(() => {
    if (accepted) setDraft((current) => (current.trim() === accepted.input ? '' : current));
  }, [accepted, setDraft]);
  return lifetime;
}
