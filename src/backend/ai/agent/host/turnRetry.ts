import { ReasoningEffortOptionSchema } from '@cherrystudio/universal/types/aiSdk';

import {
  AgentProtocolError,
  type AgentInputPart,
  type AgentMessagePart,
  type AgentMessageView,
  type AgentRetryMessageInput,
} from '@/shared/contracts/agent';
import { parseUniqueModelId } from '@/shared/data/types/model';

import { raceAbort } from '../runtime';
import type { AgentSessionStore } from '../sessionStore/AgentSessionStore';
import {
  loadTurnContext,
  prepareResolvedTurn,
  type TurnPreparationDependencies,
} from './turnPreparation';

/**
 * Keep the recorded prefix through the last completed tool outcome and discard
 * the unfinished provider response after it. A successful answer is replaced
 * outright, and an answer that never completed a tool has no reusable prefix:
 * both restart from the original question with an empty message.
 */
export function retryAssistantParts(message: AgentMessageView): AgentMessagePart[] {
  if (message.status === 'success') return [];
  const lastToolIndex = message.parts.findLastIndex(
    (part) => part.type === 'tool' && part.input !== undefined && part.output !== undefined,
  );
  if (lastToolIndex < 0) return [];
  return message.parts.filter(
    (part, index) =>
      index <= lastToolIndex &&
      part.type !== 'error' &&
      // The replacement plans context from scratch and emits its own anchors;
      // the previous attempt's describe a compaction that no longer applies.
      part.type !== 'data-compaction-anchor' &&
      (part.type !== 'tool' || (part.input !== undefined && part.output !== undefined)),
  );
}

export function retryMessageSource(messages: AgentMessageView[], messageId: string) {
  const assistantIndex = messages.findIndex((message) => message.id === messageId);
  const assistant = messages[assistantIndex];
  const user = messages[assistantIndex - 1];
  if (
    !assistant ||
    assistant.role !== 'assistant' ||
    !user ||
    user.role !== 'user' ||
    !assistant.turnId ||
    user.turnId !== assistant.turnId
  ) {
    throw new AgentProtocolError({
      code: 'MESSAGE_NOT_FOUND',
      message: 'The answer has no matching user input in this session.',
      retryable: false,
    });
  }
  // Only the latest answer is retryable: replacing an earlier one would leave
  // every later message answering a response that no longer exists
  // (agent-protocol.md "Manual answer retry"). Earlier points fork instead.
  if (assistantIndex !== messages.length - 1) {
    throw new AgentProtocolError({
      code: 'MESSAGE_NOT_FOUND',
      message: 'Only the latest answer in the session can be retried.',
      retryable: false,
    });
  }
  if (assistant.status === 'pending' || assistant.status === 'streaming') {
    throw new AgentProtocolError({
      code: 'SESSION_BUSY',
      message: 'The answer has not finished.',
      retryable: false,
    });
  }
  return {
    assistant,
    user,
    history: messages.slice(0, assistantIndex - 1),
  };
}

export async function prepareRetryTurn(
  dependencies: TurnPreparationDependencies & { store: AgentSessionStore },
  input: AgentRetryMessageInput,
  signal: AbortSignal,
) {
  const documentParserMode = dependencies.documentParserMode();
  const session = await raceAbort(dependencies.store.getSession(input.sessionId), signal);
  if (!session) {
    throw new AgentProtocolError({
      code: 'SESSION_NOT_FOUND',
      message: 'The session no longer exists.',
      retryable: false,
    });
  }
  const configuredAgent = await raceAbort(dependencies.agents.getAgent(session.agentId), signal);
  if (!configuredAgent) {
    throw new AgentProtocolError({
      code: 'AGENT_NOT_FOUND',
      message: 'The Agent no longer exists.',
      retryable: false,
    });
  }
  // Same context path as a submission: the retried pair is the tail of the
  // post-checkpoint slice, so nothing the Runtime already summarized is reread.
  const { storedTurnContext, runtimeContextCheckpoint } = await loadTurnContext(
    dependencies,
    session.id,
    signal,
    input.messageId,
  );
  const source = retryMessageSource(storedTurnContext.history, input.messageId);
  const assistantParts = retryAssistantParts(source.assistant);
  const snapshot =
    source.assistant.inferenceSnapshot?.status === 'supported'
      ? source.assistant.inferenceSnapshot.snapshot
      : undefined;
  const modelId = snapshot?.model.uniqueModelId ?? source.assistant.modelId ?? undefined;
  const reasoning = ReasoningEffortOptionSchema.safeParse(snapshot?.reasoningEffort);
  const agent = {
    ...configuredAgent,
    ...(modelId ? { model: parseUniqueModelId(modelId) } : {}),
    ...(snapshot
      ? {
          options: {
            ...snapshot.parameters,
            ...(reasoning.success ? { reasoningEffort: reasoning.data } : {}),
          },
        }
      : {}),
  };
  const parts = source.user.parts.flatMap((part): AgentInputPart[] => {
    if (part.type === 'text') {
      return [
        {
          type: 'text',
          text: part.text,
          ...(part.pluginReferences ? { pluginReferences: part.pluginReferences } : {}),
        },
      ];
    }
    if (part.type === 'file' && part.purpose === 'input-attachment') {
      return [
        {
          type: 'file',
          fileEntryId: part.fileEntryId,
          mediaType: part.mediaType,
          ...(part.name ? { name: part.name } : {}),
        },
      ];
    }
    return [];
  });
  if (parts.length === 0) {
    throw new AgentProtocolError({
      code: 'MESSAGE_NOT_FOUND',
      message: 'The original input is unavailable.',
      retryable: false,
    });
  }
  const plan = await prepareResolvedTurn(
    dependencies,
    {
      sessionId: session.id,
      userMessageId: source.user.id,
      assistantMessageId: source.assistant.id,
      parts,
      ...(modelId ? { modelId } : {}),
      ...(snapshot?.imageGeneration ? { imageGeneration: snapshot.imageGeneration } : {}),
    },
    session,
    agent,
    // The session-wide file ledger and turn ids stay as the store computed
    // them; only the history narrows to what precedes the replaced pair.
    { ...storedTurnContext, history: source.history },
    runtimeContextCheckpoint,
    documentParserMode,
    signal,
  );
  return { plan, source, assistantParts };
}
