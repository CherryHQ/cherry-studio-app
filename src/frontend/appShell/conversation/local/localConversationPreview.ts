import { cacheService } from '@/frontend/data/CacheService';
import type { AgentProtocol, AgentSessionStatus } from '@/shared/contracts/agent';

import type {
  ConversationListStatus,
  ConversationPreview,
  ConversationRef,
  OperationOutcome,
  Readable,
} from '../contracts';
import { ConversationReadError } from '../conversationState';
import { localConversationFailure } from './localConversationFailure';

export type ConversationReadMarks = {
  get(sessionId: string): string | null | undefined;
  subscribe(sessionId: string, listener: () => void): () => void;
};

export function toConversationListStatus(
  turn: AgentSessionStatus | null,
  readMark: string | null | undefined,
): ConversationListStatus | undefined {
  if (turn?.status === 'running' || turn?.status === 'cancelling') return 'running';
  if (
    turn?.status === 'awaiting-approval' ||
    turn?.status === 'awaiting-input' ||
    turn?.status === 'failed'
  )
    return turn.status;
  if (turn?.status === 'completed' && turn.turnId !== readMark) return 'unread';
  return undefined;
}

export function createLocalConversationPreview(input: {
  agent: AgentProtocol;
  address: ConversationRef;
  readMarks?: ConversationReadMarks;
  status?: Readable<ConversationListStatus | undefined>;
  assertSource(): void;
  onChanged(sessionId: string): void;
}): ConversationPreview {
  const { agent, address, readMarks } = input;
  input.assertSource();
  if (address.source.kind !== 'local')
    throw new ConversationReadError({ code: 'invalid-input', retry: 'none' });
  const sessionId = address.sessionId;
  const execute = async (work: () => Promise<unknown>): Promise<OperationOutcome<void>> => {
    try {
      input.assertSource();
      await work();
      input.onChanged(sessionId);
      return { state: 'applied', value: undefined };
    } catch (error) {
      return {
        state: 'rejected',
        failure:
          error instanceof ConversationReadError ? error.failure : localConversationFailure(error),
      };
    }
  };
  return {
    status: input.status ?? {
      getSnapshot: () =>
        toConversationListStatus(agent.getSessionStatus(sessionId), readMarks?.get(sessionId)),
      subscribe: (listener) => {
        const unstatus = agent.subscribeSessionStatus(sessionId, listener);
        const unread = readMarks?.subscribe(sessionId, listener);
        return () => {
          unstatus();
          unread?.();
        };
      },
    },
    rename: {
      availability: { state: 'enabled' },
      execute: ({ title }) => execute(() => agent.renameSession({ sessionId, name: title.trim() })),
    },
    remove: {
      availability: { state: 'enabled' },
      execute: () =>
        execute(async () => {
          await agent.deleteSession({ sessionId });
          cacheService.deleteCasual(`chat.followup_queue.${sessionId}`);
        }),
    },
  };
}
