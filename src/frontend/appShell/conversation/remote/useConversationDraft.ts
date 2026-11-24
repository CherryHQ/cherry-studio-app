import { useEffect, useState, useSyncExternalStore } from 'react';

import type { RemoteModelSelection } from '@/shared/contracts/remoteAgent';

import type { AgentRef, WorkspaceRef } from '../contracts';
import type { ConversationDraft, DraftId } from './remoteContracts';
import { useRemoteConversationSource } from './useRemoteConversationSource';

export function useConversationDraft(
  agent: AgentRef | undefined,
  workspace: WorkspaceRef | undefined,
  draftId: DraftId | undefined,
  model?: RemoteModelSelection,
) {
  const source = useRemoteConversationSource();
  const key = JSON.stringify([
    source.scope,
    agent,
    workspace,
    draftId,
    model?.providerId,
    model?.modelId,
  ]);
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
      .prepareDraft({ agent, workspace, draftId, model }, lifetime.signal)
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
  }, [source, agent, workspace, draftId, model, key]);
  const draft = resolved?.key === key ? resolved.draft : undefined;
  const state = useSyncExternalStore(
    draft?.state.subscribe ?? subscribeNone,
    draft?.state.getSnapshot ?? emptyDraft,
  );
  return { draft, state, error: resolved?.key === key ? resolved.error : undefined };
}
const subscribeNone = () => () => {};
const emptyDraft = () => undefined;
