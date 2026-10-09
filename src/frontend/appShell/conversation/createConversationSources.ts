import type { AgentProtocol } from '@/shared/contracts/agent';
import type { RemoteAgentModule } from '@/shared/contracts/remoteAgent';
import type { ApiClient } from '@/shared/data/api/types';

import type { ConversationSource, ConversationSourceRef } from './contracts';
import { ConversationReadError } from './conversationState';
import { createLocalConversationSource } from './local/createLocalConversationSource';
import type { ConversationReadMarks } from './local/localConversationPreview';
import { createRemoteConversationSource } from './remote/createRemoteConversationSource';

/** The only source-kind dispatch. Construction never opens a desktop channel. */
export function createConversationSources(input: {
  agent: AgentProtocol;
  remoteAgent: RemoteAgentModule;
  api: ApiClient;
  readMarks?: ConversationReadMarks;
  onSessionChanged(sessionId: string): void;
}) {
  const local = createLocalConversationSource(input);
  const remoteSources = new Map<string, { source: ConversationSource; users: number }>();
  const lifetime = new AbortController();
  return {
    async open(ref: ConversationSourceRef, signal: AbortSignal) {
      signal.throwIfAborted();
      if (lifetime.signal.aborted)
        throw new ConversationReadError({ code: 'retired', retry: 'none' });
      if (ref.kind === 'local') return { source: local, release() {} };
      const remote = await input.remoteAgent.open(
        ref.connectionId,
        AbortSignal.any([signal, lifetime.signal]),
      );
      if (signal.aborted || lifetime.signal.aborted) {
        remote.dispose();
        throw new ConversationReadError({ code: 'cancelled', retry: 'none' });
      }
      let entry = remoteSources.get(remote.scope);
      if (entry) remote.dispose();
      else {
        entry = { source: createRemoteConversationSource(ref.connectionId, remote), users: 0 };
        remoteSources.set(remote.scope, entry);
      }
      const retained = entry;
      retained.users++;
      let released = false;
      return {
        source: retained.source,
        release: () => {
          if (released) return;
          released = true;
          if (--retained.users === 0) {
            remoteSources.delete(remote.scope);
            retained.source.dispose();
          }
        },
      };
    },
    dispose() {
      lifetime.abort();
      local.dispose();
      for (const { source } of remoteSources.values()) source.dispose();
      remoteSources.clear();
    },
  };
}
