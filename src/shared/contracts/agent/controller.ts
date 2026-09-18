import type { ResolvedFile } from '../file';
import type { JsonValue } from './views';

/** Application protocol v2 for PC-owned conversations. Wire envelopes stay in the adapter. */
export type AgentControllerConnection = Readonly<{
  status: 'connecting' | 'ready' | 'reconnecting' | 'unavailable' | 'closed';
  error?: string;
  sourceKey?: string;
  capabilities: Readonly<{
    workspaces: boolean;
    send: boolean;
    cancel: boolean;
    respond: boolean;
    details: boolean;
    artifacts: boolean;
  }>;
}>;

export type ControllerAgent = {
  id: string;
  name: string;
  description?: string;
  availability: 'configured' | 'model-missing';
};
export type ControllerWorkspace = {
  id: string;
  name: string;
  path: string;
  type: 'user' | 'system';
};
export type ControllerSession = {
  id: string;
  agentId: string;
  name: string;
  workspace?: ControllerWorkspace;
  createdAt?: string;
};
export type ControllerPage<T> = { items: T[]; nextCursor?: string | null };

/** Opaque, source-bound reference. Only its owning adapter may interpret it. */
export type ControllerResource = string;
export type ControllerPart =
  | {
      id: string;
      type: 'text' | 'reasoning' | 'code';
      text: string;
      language?: string;
      truncated: boolean;
    }
  | { id: string; type: 'artifact'; name: string; resource: ControllerResource; mediaType?: string }
  | { id: string; type: 'error'; code: string };
export type ControllerMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: ControllerPart[];
  status: 'pending' | 'streaming' | 'success' | 'error';
  createdAt?: string;
  detailsAvailable: boolean;
  truncated: boolean;
};
export type ControllerInteraction = { id: string; toolName: string; canRespond: boolean };
export type ControllerSessionSnapshot = {
  current: boolean;
  session: ControllerSession;
  status:
    | 'idle'
    | 'pending'
    | 'streaming'
    | 'awaiting-approval'
    | 'done'
    | 'error'
    | 'aborted'
    | 'finalizing';
  executions: { id: string; messageId?: string }[];
  liveMessages: ControllerMessage[];
  interactions: ControllerInteraction[];
};
export type ControllerQuestion = {
  question: string;
  header?: string;
  multiple: boolean;
  options: { label: string; description?: string }[];
};
export type ControllerInteractionContent = {
  id: string;
  input: JsonValue;
  questions?: ControllerQuestion[];
};
export type ControllerDetail = {
  id: string;
  type: string;
  name?: string;
  /** Lightweight tool state; arguments and results remain behind resource references. */
  state?: string;
  fields: { name: string; resource: ControllerResource }[];
};
export type ControllerAction = Readonly<{
  id: string;
  kind: 'create' | 'send' | 'cancel' | 'respond';
  agentId?: string;
  userMessageId?: string;
  sessionId?: string;
  text?: string;
  status:
    | 'confirming'
    | 'accepted'
    | 'queued'
    | 'applied'
    | 'resolved'
    | 'cancelled'
    | 'execution-changed'
    | 'interrupted'
    | 'failed';
  error?: string;
}>;

/** One retained source binding; disposal releases observation, never PC execution. */
export interface AgentController {
  readonly version: 2;
  getConnection(): AgentControllerConnection;
  subscribeConnection(listener: () => void): () => void;
  reconnect(): void;
  listAgents(cursor?: string, signal?: AbortSignal): Promise<ControllerPage<ControllerAgent>>;
  listWorkspaces(
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<ControllerPage<ControllerWorkspace>>;
  listSessions(
    agentId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<ControllerPage<ControllerSession>>;
  history(
    sessionId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<ControllerPage<ControllerMessage>>;
  observe(sessionId: string, listener: (snapshot: ControllerSessionSnapshot) => void): () => void;
  createSession(agentId: string, workspaceId?: string): Promise<ControllerAction>;
  sendMessage(sessionId: string, text: string): Promise<ControllerAction>;
  cancel(sessionId: string, executionId: string): Promise<ControllerAction>;
  respond(
    sessionId: string,
    interactionId: string,
    response: { approved: boolean; reason?: string; answers?: Record<string, string> },
  ): Promise<ControllerAction>;
  getActions(): readonly ControllerAction[];
  subscribeActions(listener: () => void): () => void;
  retryAction(id: string): Promise<void>;
  dismissAction(id: string): void;
  interaction(
    sessionId: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<ControllerInteractionContent>;
  details(
    sessionId: string,
    messageId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<ControllerPage<ControllerDetail>>;
  readDetail(resource: ControllerResource, signal?: AbortSignal): Promise<string>;
  download(
    resource: ControllerResource,
    signal: AbortSignal,
    onProgress: (received: number, total: number) => void,
  ): Promise<ResolvedFile>;
  dispose(): void;
}

export interface AgentControllerModule {
  open(connectionId: string): Promise<AgentController>;
}
