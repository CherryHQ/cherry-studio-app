import type { ChatBackend, ChatSession } from '@/shared/contracts';
import type { BranchMessagesQueryParams } from '@/shared/data/api/schemas/messages';
import type { BranchMessagesResponse } from '@/shared/data/types/message';
import type { ChatSessionDependencies } from './ChatSessionDependencies';
import { ChatSessionImpl } from './ChatSessionImpl';

export class ChatService implements ChatBackend {
  constructor(private readonly dependencies: ChatSessionDependencies) {}

  createSession(): ChatSession {
    return new ChatSessionImpl(this.dependencies);
  }

  listMessagePage(
    topicId: string,
    query?: BranchMessagesQueryParams,
  ): Promise<BranchMessagesResponse> {
    return this.dependencies.services.message.getBranchMessages(topicId, query);
  }
}
