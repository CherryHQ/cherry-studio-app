import { useEffect, useMemo, useState } from 'react';

import type {
  ConversationHistoryView,
  ConversationMessage,
  ConversationSnapshot,
} from '@/frontend/appShell/conversation';

import { mergeAgentMessageViews } from './agentMessageProjection';
import { useAgentChatClient, useAgentSessionState } from './ChatProvider';
import { createLocalConversationProjector } from './localConversationView';
import {
  type MessageNavigation,
  useAgentMessageHistoryWindow,
} from './useAgentMessageHistoryWindow';

/**
 * The local chat's read model: client state projected to a snapshot, the Session-keyed history
 * window, and the two merged by message id. No observation is opened here; the client subscribes
 * while this hook is mounted and the history Query outlives the page.
 */
export function useLocalConversation(input: {
  sessionId?: string;
  title?: string;
  navigation?: MessageNavigation;
}): {
  snapshot: ConversationSnapshot;
  messages: readonly ConversationMessage[];
  messageWindow: ConversationHistoryView;
} {
  const { sessionId, title, navigation } = input;
  const { client, onSessionChanged } = useAgentChatClient();
  const state = useAgentSessionState(sessionId);
  const window = useAgentMessageHistoryWindow(sessionId, navigation);
  const [owned, setOwned] = useState(() => ({
    sessionId,
    client,
    projector: sessionId
      ? createLocalConversationProjector({ client, sessionId, onSessionChanged })
      : undefined,
  }));
  let projector = owned.projector;
  if (owned.sessionId !== sessionId || owned.client !== client) {
    projector = sessionId
      ? createLocalConversationProjector({ client, sessionId, onSessionChanged })
      : undefined;
    setOwned({ sessionId, client, projector });
  }
  const { messages: history } = window;
  useEffect(() => {
    if (sessionId) client.reconcilePersistedMessages(sessionId, history);
  }, [client, history, sessionId]);
  const snapshot = useMemo<ConversationSnapshot>(
    () =>
      projector
        ? projector.snapshot(state, title)
        : {
            title: title ?? '',
            freshness: { state: 'loading' },
            liveMessages: [],
            executions: [],
            interactions: [],
          },
    [projector, state, title],
  );
  const historyMessages = useMemo(
    () => (projector ? history.map((message) => projector.message(message, state)) : []),
    [projector, history, state],
  );
  const messages = useMemo(() => {
    if (!projector) return [];
    if (window.hasNewerMessages) return historyMessages;
    return mergeAgentMessageViews(history, state.liveMessages).map((message) =>
      projector.message(message, state),
    );
  }, [projector, history, historyMessages, state, window.hasNewerMessages]);
  const messageWindow = useMemo<ConversationHistoryView>(
    () => ({ ...window, messages: historyMessages }),
    [window, historyMessages],
  );
  return { snapshot, messages, messageWindow };
}
