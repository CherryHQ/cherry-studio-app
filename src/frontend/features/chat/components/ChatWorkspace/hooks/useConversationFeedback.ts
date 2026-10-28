import { useCallback, useLayoutEffect, useRef } from 'react';

import type { ConversationSnapshot } from '@/frontend/appShell/conversation';
import {
  feedbackFailureContext,
  feedbackTimestamp,
  useFeedbackActions,
  useFeedbackSource,
} from '@/frontend/appShell/feedback';
import type { MessageListItem } from '@/frontend/components/Message';
import { diagnosticIdentifier } from '@/shared/utils/diagnosticIdentifier';

export function useConversationFeedback({
  executionSource,
  messages,
  sessionId,
  snapshot,
}: {
  executionSource: 'local' | 'desktop';
  messages: readonly MessageListItem[];
  sessionId?: string;
  snapshot: ConversationSnapshot;
}) {
  const { openFeedback } = useFeedbackActions();
  // Streaming replaces the list often; reporting reads it only when the user asks.
  const latestMessages = useRef(messages);
  useLayoutEffect(() => {
    latestMessages.current = messages;
  });
  const agentId = snapshot.agentId;
  useFeedbackSource(() => {
    const running =
      snapshot.freshness.state === 'current'
        ? snapshot.executions.filter((execution) =>
            ['running', 'awaiting-approval', 'awaiting-input', 'finalizing'].includes(
              execution.state,
            ),
          )
        : [];
    // Several concurrent executions remain unassigned until the user chooses a message.
    const activeId = running.length === 1 ? diagnosticIdentifier(running[0].id) : undefined;
    return {
      feature: 'chat',
      executionSource,
      agentId: diagnosticIdentifier(agentId),
      sessionId: diagnosticIdentifier(sessionId),
      ...(executionSource === 'local' ? { turnId: activeId } : { executionId: activeId }),
    };
  });

  return useCallback(
    (messageId: string) => {
      const message = latestMessages.current.find((item) => item.id === messageId);
      if (!message) return;
      const error = message.data.parts?.findLast((part) => part.type === 'data-error');
      const failure = error?.type === 'data-error' ? feedbackFailureContext(error.data) : undefined;
      void openFeedback({
        feature: 'chat',
        executionSource,
        agentId: diagnosticIdentifier(agentId),
        sessionId: diagnosticIdentifier(sessionId),
        turnId: diagnosticIdentifier(message.turnId),
        messageId: diagnosticIdentifier(message.id),
        messageCreatedAt: feedbackTimestamp(message.createdAt),
        ...failure,
        providerId: diagnosticIdentifier(message.model?.providerId) ?? failure?.providerId,
        modelId: diagnosticIdentifier(message.model?.modelId) ?? failure?.modelId,
      });
    },
    [agentId, executionSource, openFeedback, sessionId],
  );
}
