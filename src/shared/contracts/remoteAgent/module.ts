import type { InteractionResponse } from '../interaction';
import type {
  RemoteAgentView,
  RemoteAttachment,
  RemoteAttachmentDraftTarget,
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
  RemoteWorkspaceFileView,
} from './views';

/** One retained credential-free scope. Disposing observations never cancels desktop execution. */
export interface RemoteAgentSource {
  readonly scope: string;
  readonly draftScope: string;
  getState(): RemoteSourceState;
  subscribeState(listener: () => void): () => void;
  listAgents(cursor: string | undefined, signal: AbortSignal): Promise<RemotePage<RemoteAgentView>>;
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
  getWorkspaceFile?(
    sessionId: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<RemoteWorkspaceFileView>;
  checkFileRevision?(
    sessionId: string,
    path: string,
    expectedRevision?: string,
  ): Promise<{ isCurrent: boolean; latestRevision: string }>;
  subscribeFileStale?(
    listener: (event: { sessionId: string; path: string; latestRevision: string }) => void,
  ): () => void;
  start(input: RemoteStartInput): Promise<RemoteStartOperation>;
  renameSession(sessionId: string, title: string): Promise<RemoteCommand>;
  send(
    target: string,
    text: string,
    attachments?: readonly RemoteAttachment[],
    options?: { model?: { modelId: string; providerId: string }; reasoningEffort?: string },
  ): Promise<RemoteCommand>;
  stageAttachments?(
    key: string,
    target: RemoteAttachmentDraftTarget,
    attachments: RemoteAttachment[],
  ): void;
  cancelUpload?(id: string): void;
  cancel(target: string): Promise<RemoteCommand>;
  respond(target: string, response: InteractionResponse): Promise<RemoteCommand>;
  getCommands(): readonly RemoteCommand[];
  getStarts(): readonly RemoteStartOperation[];
  subscribeOperations(listener: () => void): () => void;
  /** Forgets a final outcome; pending work stays until the journal settles it. */
  discard(operationId: string): void;
  /** Hands a start's Session to its route: the start is forgotten, an undelivered first send stays. */
  release(startId: string): void;
  dispose(): void;
}
export interface RemoteAgentModule {
  open(connectionId: string, signal: AbortSignal): Promise<RemoteAgentSource>;
}
