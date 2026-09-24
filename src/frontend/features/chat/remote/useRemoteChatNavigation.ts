import { useIsFocused, useRouter } from 'expo-router';
import { useLayoutEffect, useRef, useState } from 'react';
import { v7 as uuidv7 } from 'uuid';

import type { ConversationRef } from '@/frontend/appShell/conversation';
import type { DraftId, RemoteConversationSource } from '@/frontend/appShell/conversation/remote';
import {
  conversationHref,
  useChatSource,
  type RemoteChatTarget,
} from '@/frontend/appShell/navigation/chat';

/** Draft identity owns input; Agent selection only changes the destination until submission. */
export function useRemoteChatNavigation(
  target: RemoteChatTarget,
  source: Pick<RemoteConversationSource, 'operations'>,
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

  return {
    draftId,
    identity,
    selectAgent: (agentId: string) => {
      // Read at click time: admission may have happened since the header last rendered.
      const submitted = source.operations
        .getSnapshot()
        .some((operation) => operation.draftId === draftId);
      const nextDraftId = target.sessionId || submitted ? uuidv7() : draftId;
      if (nextDraftId !== draftId || target.sessionId) origin.current = undefined;
      openRemote({ connectionId: target.connectionId, agentId, draftId: nextDraftId });
    },
    startNewChat: (agentId?: string) => {
      origin.current = undefined;
      openRemote({ connectionId: target.connectionId, agentId, draftId: uuidv7() });
    },
    onSessionCreated: (ref: ConversationRef) => {
      if (origin.current !== identity) return false;
      setHandoff({ sessionId: ref.sessionId, key: identity });
      router.replace(conversationHref(ref));
      return true;
    },
  };
}
