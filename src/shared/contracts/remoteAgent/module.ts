import type { InteractionResponse } from '../interaction';
import type {
  RemoteCommand,
  RemoteModelSummary,
  RemoteStartInput,
  RemoteMessageView,
  RemotePage,
  RemoteResource,
  RemoteResourceValue,
  RemoteSessionSnapshot,
  RemoteSessionView,
  RemoteSessionReadPreview,
  RemoteSourceState,
  RemoteStartOperation,
} from './views';

/** One retained credential-free scope. Disposing observations never cancels desktop execution. */
export interface RemoteAgentSource {
  readonly scope: string;
  readonly draftScope: string;
  getState(): RemoteSourceState;
  subscribeState(listener: () => void): () => void;
  listAgents(
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<
    RemotePage<{ id: string; name: string; emoji?: string; model?: RemoteModelSummary | null }>
  >;
  listWorkspaces(
    agentId: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<RemotePage<{ id: string; name: string }> & { systemWorkspace?: boolean }>;
  listSessions(
    agentId: string | undefined,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<RemotePage<RemoteSessionView>>;
  peekSession(sessionId: string): RemoteSessionReadPreview | undefined;
  subscribeReads(sessionId: string, listener: () => void): () => void;
  readSession(sessionId: string, signal: AbortSignal): Promise<RemoteSessionView>;
  observe(sessionId: string, listener: (value: RemoteSessionSnapshot) => void): () => void;
  history(
    sessionId: string,
    version: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<RemotePage<RemoteMessageView>>;
  readResource(resource: RemoteResource, signal: AbortSignal): Promise<RemoteResourceValue>;
  start(input: RemoteStartInput): Promise<RemoteStartOperation>;
  send(target: string, text: string): Promise<RemoteCommand>;
  cancel(target: string): Promise<RemoteCommand>;
  respond(target: string, response: InteractionResponse): Promise<RemoteCommand>;
  getCommands(): readonly RemoteCommand[];
  getStarts(): readonly RemoteStartOperation[];
  subscribeOperations(listener: () => void): () => void;
  recover(operationId: string): Promise<void>;
  dismiss(operationId: string): void;
  dispose(): void;
}
export interface RemoteAgentModule {
  open(connectionId: string, signal: AbortSignal): Promise<RemoteAgentSource>;
}
