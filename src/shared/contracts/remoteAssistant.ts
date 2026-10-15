import type { RemoteConversationSource } from './remoteAgent';

/** Assistant topics have independent grants and durable commands; disposal only releases observations. */
export interface RemoteAssistantModule {
  open(connectionId: string, signal: AbortSignal): Promise<RemoteConversationSource>;
}
