import type { ChatBackend, ChatSession } from '@/shared/contracts';
import type { BackgroundReplyLifecycle } from '../backgroundReply';
import type { ChatSessionDependencies } from './ChatSessionDependencies';
import { ChatSessionImpl } from './ChatSessionImpl';

type ChatServiceDependencies = Omit<ChatSessionDependencies, 'backgroundReply'> & {
  createBackgroundReply: () => BackgroundReplyLifecycle;
};

export class ChatService implements ChatBackend {
  constructor(private readonly dependencies: ChatServiceDependencies) {}

  createSession(): ChatSession {
    const { createBackgroundReply, ...dependencies } = this.dependencies;
    return new ChatSessionImpl({
      ...dependencies,
      backgroundReply: createBackgroundReply(),
    });
  }
}
