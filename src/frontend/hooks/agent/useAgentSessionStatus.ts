import { useCallback, useSyncExternalStore } from 'react';

import { useBackendModule, useCache } from '@/frontend/data';

export function useAgentSessionStatus(sessionId: string) {
  const agent = useBackendModule('agent');
  const subscribe = useCallback(
    (listener: () => void) => agent.subscribeSessionStatus(sessionId, listener),
    [agent, sessionId],
  );
  const getSnapshot = useCallback(() => agent.getSessionStatus(sessionId), [agent, sessionId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [lastSeenTurnId, setLastSeenTurnId] = useCache(`chat.last_seen_turn.${sessionId}`);
  const completedTurnId = snapshot?.status === 'completed' ? snapshot.turnId : null;
  const markSeen = useCallback(() => {
    if (completedTurnId) {
      setLastSeenTurnId(completedTurnId);
    }
  }, [completedTurnId, setLastSeenTurnId]);

  return {
    status: snapshot?.status,
    isUnread: completedTurnId !== null && completedTurnId !== lastSeenTurnId,
    markSeen,
  };
}
