import type { AgentProtocol } from '@/shared/contracts/agent';
import type { RemoteAgentModule } from '@/shared/contracts/remoteAgent';
import type { ApiClient } from '@/shared/data/api/types';

import type { ConversationSource, ConversationSourceRef } from './contracts';
import { ConversationReadError } from './conversationState';
import { createLocalConversationSource } from './local/createLocalConversationSource';
import { createRemoteConversationSource } from './remote/createRemoteConversationSource';

/** The only source-kind dispatch. Construction never opens a desktop channel. */
export function createConversationSources(input: {
  agent: AgentProtocol;
  remoteAgent: RemoteAgentModule;
  api: ApiClient;
  onSessionChanged(sessionId: string): void;
  onTranscriptChanged(sessionId: string): void;
}) {
  const local = createLocalConversationSource(input);
  const remoteSources = new Set<ConversationSource>();
  const lifetime = new AbortController();
  return {
    local,
    async open(ref: ConversationSourceRef, signal: AbortSignal) {
      signal.throwIfAborted();
      if (lifetime.signal.aborted)
        throw new ConversationReadError({ code: 'retired', retry: 'none' });
      if (ref.kind === 'local') return { source: local.source, release() {} };
      const remote = await input.remoteAgent.open(
        ref.connectionId,
        AbortSignal.any([signal, lifetime.signal]),
      );
      if (signal.aborted || lifetime.signal.aborted) {
        remote.dispose();
        throw new ConversationReadError({ code: 'cancelled', retry: 'none' });
      }
      const source = createRemoteConversationSource(ref.connectionId, remote);
      remoteSources.add(source);
      return {
        source,
        release: () => {
          remoteSources.delete(source);
          source.dispose();
        },
      };
    },
    dispose() {
      lifetime.abort();
      local.source.dispose();
      for (const source of remoteSources) source.dispose();
      remoteSources.clear();
    },
  };
}
