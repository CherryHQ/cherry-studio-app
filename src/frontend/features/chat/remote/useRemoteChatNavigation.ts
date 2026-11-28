import { useIsFocused, useRouter } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';

import type {
  DraftId,
  RemoteConversationSource,
  RemoteDraftHandoff,
} from '@/frontend/appShell/conversation/remote';
import { useChatSource, type RemoteChatTarget } from '@/frontend/appShell/navigation/chat';

import { remoteDraftKey, writeRemoteDraftModel } from './useRemoteDraftPersistence';

/** Draft identity owns input; Agent selection only changes the destination until submission. */
export function useRemoteChatNavigation(
  target: RemoteChatTarget,
  source: Pick<RemoteConversationSource, 'hasSubmission' | 'draftScope' | 'ref'>,
) {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { openRemote } = useChatSource();
  const [initialDraftId] = useState(() => uuidv7());
  const draftId = (target.draftId ?? initialDraftId) as DraftId;
  const [handoff, setHandoff] = useState<{ sessionId: string; key: string }>();
  const identity = target.sessionId
    ? handoff?.sessionId === target.sessionId
      ? handoff.key
      : `session:${target.sessionId}`
    : `draft:${draftId}`;
  const origin = useRef<string | undefined>(undefined);
  // Arm before child recovery effects run, and disarm before leaving this route.
  useLayoutEffect(() => {
    origin.current = isFocused ? identity : undefined;
    return () => {
      origin.current = undefined;
    };
  }, [identity, isFocused]);

  // The sidebar reads the shared route target. Publish the actual composer identity so an
  // external-app callback can restore unsent input even after this process is reclaimed.
  useLayoutEffect(() => {
    const routeDraftId = target.sessionId ? undefined : draftId;
    if (isFocused && target.draftId !== routeDraftId) router.setParams({ draftId: routeDraftId });
  }, [draftId, isFocused, router, target.draftId, target.sessionId]);

  return {
    draftId,
    identity,
    selectAgent: (agentId: string) => {
      // Read at click time: admission may have happened since the header last rendered. A submitted
      // start keeps its route; an undelivered one stays on the draft and still resends to its Agent.
      const nextDraftId = target.sessionId || source.hasSubmission(draftId) ? uuidv7() : draftId;
      if (nextDraftId !== draftId || target.sessionId) origin.current = undefined;
      openRemote({ connectionId: target.connectionId, agentId, draftId: nextDraftId });
    },
    startNewChat: (agentId?: string) => {
      origin.current = undefined;
      openRemote({ connectionId: target.connectionId, agentId, draftId: uuidv7() });
    },
    onSessionCreated: ({ conversation: ref, inputDraftId, agentId }: RemoteDraftHandoff) => {
      if (origin.current !== identity) return false;
      const sameComposer =
        inputDraftId === draftId && (!target.agentId || target.agentId === agentId);
      setHandoff(sameComposer ? { sessionId: ref.sessionId, key: identity } : undefined);
      // Old records identify the receiving route only. Its unsent input may belong to another draft.
      if (inputDraftId)
        writeRemoteDraftModel(remoteDraftKey(source, `draft:${inputDraftId}`), agentId);
      // Same route: replacing would remount the whole screen and flash it.
      router.setParams({
        sessionId: ref.sessionId,
        draftId: undefined,
        ...(!sameComposer && { agentId }),
      });
      return true;
    },
  };
}
