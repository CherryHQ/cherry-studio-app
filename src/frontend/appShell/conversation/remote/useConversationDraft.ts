import { useEffect, useState, useSyncExternalStore } from 'react';

import type { AgentRef, Readable, WorkspaceRef } from '../contracts';
import type { ConversationDraft, ConversationOperation, DraftId } from './remoteContracts';
import { useRemoteConversationSource } from './useRemoteConversationSource';

export function useConversationDraft(
  agent: AgentRef | undefined,
  workspace: WorkspaceRef | undefined,
  draftId: DraftId | undefined,
) {
  const source = useRemoteConversationSource();
  const key = JSON.stringify([source.scope, agent, workspace, draftId]);
  const [resolved, setResolved] = useState<{
    key: string;
    draft?: ConversationDraft;
    error?: unknown;
  }>();
  useEffect(() => {
    if (!agent || !draftId) return;
    const lifetime = new AbortController();
    let draft: ConversationDraft | undefined;
    void source.catalog
      .prepareDraft({ agent, workspace, draftId }, lifetime.signal)
      .then((value) => {
        draft = value;
        if (lifetime.signal.aborted) value.dispose();
        else setResolved({ key, draft: value });
      })
      .catch((error: unknown) => {
        if (!lifetime.signal.aborted) setResolved({ key, error });
      });
    return () => {
      lifetime.abort();
      draft?.dispose();
    };
  }, [source, agent, workspace, draftId, key]);
  const draft = resolved?.key === key ? resolved.draft : undefined;
  const state = useSyncExternalStore(
    draft?.state.subscribe ?? subscribeNone,
    draft?.state.getSnapshot ?? emptyDraft,
  );
  return { draft, state, error: resolved?.key === key ? resolved.error : undefined };
}
const subscribeNone = () => () => {};
const emptyDraft = () => undefined;
const EMPTY_OPERATIONS: readonly ConversationOperation[] = [];
const emptyOperations = () => EMPTY_OPERATIONS;
export function useConversationOperations(owner?: {
  operations: Readable<readonly ConversationOperation[]>;
}) {
  return useSyncExternalStore(
    owner?.operations.subscribe ?? subscribeNone,
    owner?.operations.getSnapshot ?? emptyOperations,
  );
}
