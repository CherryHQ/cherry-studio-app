import type { ConversationMessage } from '@/frontend/appShell/conversation';
import type { AgentContextUsage } from '@/shared/contracts/agent';
import type { UniqueModelId } from '@/shared/data/types/model';

export type ContextUsageSource = Readonly<{
  sessionId: string;
  messageId: string;
  modelId: UniqueModelId;
  providerId: string;
  providerModelId: string;
  tokens: number;
  estimated?: boolean;
}>;

/** Use only the working context belonging to the newest answer on the selected branch. */
export function selectContextUsageSource(input: {
  sessionId?: string;
  messages: readonly ConversationMessage[];
  usages?: readonly AgentContextUsage[];
  isCurrentWindow: boolean;
}): ContextUsageSource | undefined {
  if (!input.sessionId || !input.isCurrentWindow) return undefined;
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const message = input.messages[i];
    if (message.display.role !== 'assistant') continue;
    const { model, agentSessionId } = message.display;
    if (agentSessionId !== input.sessionId || !model?.id || !model.providerId || !model.modelId)
      return undefined;
    const usage = input.usages?.find((candidate) => candidate.messageId === message.display.id);
    if (!usage) return undefined;
    return {
      sessionId: input.sessionId,
      messageId: message.display.id,
      modelId: model.id,
      providerId: model.providerId,
      providerModelId: model.modelId,
      tokens: usage.tokens,
      ...(usage.estimated ? { estimated: true } : {}),
    };
  }
  return undefined;
}
