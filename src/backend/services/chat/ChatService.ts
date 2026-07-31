import type { ChatBackend, ChatSession } from '@/shared/contracts';
import type { ChatSessionDependencies } from './ChatSessionDependencies';
import { ChatSessionImpl } from './ChatSessionImpl';

export class ChatService implements ChatBackend {
  constructor(private readonly dependencies: ChatSessionDependencies) {}

  createSession(): ChatSession {
    return new ChatSessionImpl(this.dependencies);
  }
}
