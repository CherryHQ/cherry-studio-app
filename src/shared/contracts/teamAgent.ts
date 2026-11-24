import type { AgentMessageView, JsonValue } from './agent';
import type { MessageUsageSummary } from './messageUsage';

/** A service binding is distinct from a phone data profile and from its sign-in generation. */
export type TeamAgentContext = { bindingId: string; key: string; name?: string };
export type TeamAgentFailure =
  | 'signed-out'
  | 'unavailable'
  | 'not-visible'
  | 'offline'
  | 'unsupported'
  | 'invalid-input'
  | 'busy'
  | 'retired';
export class TeamAgentError extends Error {
  constructor(
    readonly code: TeamAgentFailure,
    readonly status?: number,
  ) {
    super(`Team Agent ${code}`);
    this.name = 'TeamAgentError';
  }
}
export type TeamAgent = {
  id: string;
  name: string;
  description?: string;
  groupName?: string;
  canCreateSession: boolean;
  maxInputLength?: number;
};
export type TeamSessionRef = { agentId: string; sessionId: string };
export const teamDraftKey = (contextKey: string, target: TeamSessionRef) =>
  JSON.stringify([contextKey, JSON.stringify([target.agentId, target.sessionId])]);
export const teamAgentDraftKey = (contextKey: string, agentId: string) =>
  JSON.stringify([contextKey, 'agent', agentId]);
export type TeamSession = TeamSessionRef & {
  title?: string;
  createdAt?: string;
  canDelete: boolean;
};
export type TeamRun = {
  id: string;
  state: 'missing' | 'unknown' | 'running' | 'done' | 'cancelled' | 'busy' | 'failed';
};
export type TeamMessage = Pick<AgentMessageView, 'id' | 'role' | 'status'> & {
  parts: readonly (
    | Extract<AgentMessageView['parts'][number], { type: 'text' | 'reasoning' }>
    | { type: 'tool'; id: string }
  )[];
  createdAt?: string;
  modelName?: string;
  usage?: MessageUsageSummary;
  tools: readonly {
    id: string;
    name: string;
    state: 'input-ready' | 'completed' | 'failed';
    input: JsonValue;
    output?: JsonValue;
  }[];
};
export type TeamChatView = {
  messages: readonly TeamMessage[];
  run: TeamRun | null;
  pending: readonly { id: string; requestId: string; kind: 'approval' | 'clarify'; text: string }[];
  canSend: boolean;
  canStop: boolean;
  canRespond: boolean;
};
export type TeamAgentDetail = {
  model?: string;
  skills: readonly { name: string; description: string; disabled: boolean }[];
  mcp: readonly { name: string; enabled: boolean }[];
};
export type TeamSubmission = { requestId: string; input: string };
export type TeamSubmitResult = 'accepted' | 'rejected' | 'unknown';
export type TeamReply = { decision: 'allow' | 'deny' } | { text: string };
export type TeamDirectoryState = {
  context: TeamAgentContext | null;
  phase: 'disabled' | 'loading' | 'ready' | 'error';
  agents: readonly TeamAgent[];
  failure?: TeamAgentFailure;
};
export type TeamConversationState = {
  phase: 'loading' | 'current' | 'error' | 'retired';
  view: TeamChatView | null;
  submitting: boolean;
  unknown?: TeamSubmission;
  accepted?: TeamSubmission;
  failure?: TeamAgentFailure;
};
export interface TeamConversation {
  getState(): TeamConversationState;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  setActive(active: boolean): void;
  send(input: string, confirmDuplicate?: boolean): Promise<TeamSubmitResult>;
  stop(): Promise<void>;
  respond(pendingId: string, requestId: string, reply: TeamReply): Promise<void>;
  dispose(): void;
}
/** Credential-free workflow; content, drafts and uncertain submissions are memory-only. */
export interface TeamAgentModule {
  getState(): TeamDirectoryState;
  subscribe(listener: () => void): () => void;
  subscribeSessions(listener: () => void): () => void;
  refresh(): Promise<void>;
  listSessions(agentId: string, signal: AbortSignal): Promise<readonly TeamSession[]>;
  createSession(agentId: string): Promise<TeamSession>;
  deleteSession(target: TeamSessionRef): Promise<void>;
  readDetail(agentId: string, signal: AbortSignal): Promise<TeamAgentDetail>;
  readPortrait(agentId: string, signal: AbortSignal): Promise<string | undefined>;
  observe(target: TeamSessionRef): TeamConversation;
  readDraft(key: string): string;
  writeDraft(key: string, text: string): void;
}
