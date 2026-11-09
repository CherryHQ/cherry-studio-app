import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type { MessageStats } from '@/shared/data/types/messageStats';
import type { UniqueModelId } from '@/shared/data/types/model';

export type ContextUsageSource = Readonly<{
  sessionId: string;
  messageId: string;
  modelId: UniqueModelId;
  providerId: string;
  providerModelId: string;
  stats: Pick<MessageStats, 'contextTokens' | 'inputTokens' | 'inputTokenDetails'>;
}>;

/** Select only the newest terminal assistant on the already-selected branch. */
export function selectContextUsageSource(input: {
  sessionId?: string;
  messages: readonly ConversationMessage[];
  isCurrentWindow: boolean;
}): ContextUsageSource | undefined {
  if (!input.sessionId || !input.isCurrentWindow) return undefined;
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const message = input.messages[i];
    if (message.display.role !== 'assistant') continue;
    if (message.state === 'pending' || message.state === 'streaming') continue;
    const { model, stats, agentSessionId } = message.display;
    if (
      message.state !== 'success' ||
      agentSessionId !== input.sessionId ||
      !model?.id ||
      !model.providerId ||
      !model.modelId
    )
      return undefined;
    return {
      sessionId: input.sessionId,
      messageId: message.display.id,
      modelId: model.id,
      providerId: model.providerId,
      providerModelId: model.modelId,
      stats: {
        contextTokens: stats?.contextTokens,
        inputTokens: stats?.inputTokens,
        inputTokenDetails: stats?.inputTokenDetails,
      },
    };
  }
  return undefined;
}
