import { useIsFocused } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type {
  TeamAgentModule,
  TeamConversationState,
  TeamSessionRef,
} from '@/shared/contracts/teamAgent';

const EMPTY: TeamConversationState = { phase: 'loading', view: null, submitting: false };
const emptySubscribe = () => () => {};
const emptyState = () => EMPTY;

export function useTeamConversation(
  module: TeamAgentModule,
  key: string,
  contextKey: string,
  target?: TeamSessionRef,
) {
  const [owned, setOwned] = useState<{
    key: string;
    conversation: ReturnType<TeamAgentModule['observe']>;
  }>();
  const focused = useIsFocused();
  const agentId = target?.agentId;
  const sessionId = target?.sessionId;
  useEffect(() => {
    if (!agentId || !sessionId || module.getState().context?.key !== contextKey) return;
    const conversation = module.observe({ agentId, sessionId });
    let live = true;
    void (module.getState().phase === 'ready' ? Promise.resolve() : module.refresh())
      .then(() => conversation.refresh())
      .catch(() => {})
      .then(() => {
        if (live) setOwned({ key, conversation });
      });
    return () => {
      live = false;
      conversation.dispose();
    };
  }, [module, key, contextKey, agentId, sessionId]);
  const conversation = owned?.key === key ? owned.conversation : undefined;
  useEffect(() => {
    if (!conversation) return;
    let live = true;
    const active = () => {
      if (!focused || AppState.currentState !== 'active') conversation.setActive(false);
      else
        void module
          .refresh()
          .catch(() => {})
          .then(() => {
            if (live && AppState.currentState === 'active') conversation.setActive(true);
          });
    };
    active();
    const subscription = AppState.addEventListener('change', active);
    return () => {
      live = false;
      subscription.remove();
      conversation.setActive(false);
    };
  }, [module, conversation, focused]);
  const state = useSyncExternalStore(
    conversation?.subscribe ?? emptySubscribe,
    conversation?.getState ?? emptyState,
    conversation?.getState ?? emptyState,
  );
  return { conversation, state };
}
