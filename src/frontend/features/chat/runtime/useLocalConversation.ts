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
  type LiveSiblingViews,
  readQuestionAnswers,
  selectedBranchMessages,
  selectedLiveMessages,
  withLiveSiblings,
} from './messageTreeView';
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
  const window = useAgentMessageHistoryWindow(sessionId, navigation, {
    settledOnly: true,
    // A search result may sit on another branch; show that branch before reading around it.
    prepareAround: sessionId
      ? async (messageId) => {
          await client.selectMessage(sessionId, messageId);
        }
      : undefined,
  });
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
  // Live rows can arrive or settle after the history already holds them, so
  // reconcile on live changes too, not only on history refetches.
  useEffect(() => {
    if (sessionId) client.reconcilePersistedMessages(sessionId, history);
  }, [client, history, sessionId, state.liveMessages]);
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
    () => (projector ? projector.history(history, state) : []),
    [projector, history, state],
  );
  const activeNodeId = state.snapshot?.session.activeNodeId;
  // Each question's answers as last read, kept while a new answer to it runs and its turn is
  // missing from settled history.
  const [readAnswers, setReadAnswers] = useState(() => ({
    history,
    byQuestion: readQuestionAnswers(history),
  }));
  if (readAnswers.history !== history)
    setReadAnswers({ history, byQuestion: readQuestionAnswers(history, readAnswers.byQuestion) });
  const [siblingViews] = useState<LiveSiblingViews>(() => new WeakMap());
  const branchMessages = useMemo(() => {
    const live = selectedLiveMessages(state.liveMessages, history, activeNodeId);
    return withLiveSiblings(
      selectedBranchMessages(mergeAgentMessageViews(history, live), activeNodeId),
      state.liveMessages,
      readAnswers.byQuestion,
      siblingViews,
    );
  }, [activeNodeId, history, readAnswers.byQuestion, siblingViews, state.liveMessages]);
  const messages = useMemo(() => {
    if (!projector) return [];
    if (window.hasNewerMessages) return historyMessages;
    return branchMessages.map((message) => projector.message(message, state));
  }, [projector, branchMessages, historyMessages, state, window.hasNewerMessages]);
  const messageWindow = useMemo<ConversationHistoryView>(
    () => ({ ...window, messages: historyMessages }),
    [window, historyMessages],
  );
  return { snapshot, messages, messageWindow };
}
