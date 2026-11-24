import type {
  TeamAgent,
  TeamAgentContext,
  TeamAgentDetail,
  TeamChatView,
  TeamReply,
  TeamSession,
  TeamSessionRef,
  TeamSubmission,
  TeamSubmitResult,
} from '@/shared/contracts/teamAgent';

/** One immutable authenticated service context; adapters own protocol and recovery semantics. */
export interface TeamAgentConnection {
  readonly context: TeamAgentContext;
  listAgents(signal: AbortSignal): Promise<readonly TeamAgent[]>;
  listSessions(agentId: string, signal: AbortSignal): Promise<readonly TeamSession[]>;
  createSession(agentId: string, signal: AbortSignal): Promise<TeamSession>;
  deleteSession(target: TeamSessionRef, signal: AbortSignal): Promise<void>;
  readDetail(agentId: string, signal: AbortSignal): Promise<TeamAgentDetail>;
  readPortrait(agentId: string, signal: AbortSignal): Promise<string | undefined>;
  readView(target: TeamSessionRef, signal: AbortSignal): Promise<TeamChatView>;
  watch(
    target: TeamSessionRef,
    signal: AbortSignal,
    snapshot: (view: TeamChatView) => void,
  ): Promise<void>;
  submit(
    target: TeamSessionRef,
    input: TeamSubmission,
    signal: AbortSignal,
  ): Promise<TeamSubmitResult>;
  stop(target: TeamSessionRef, runId: string, signal: AbortSignal): Promise<void>;
  respond(
    target: TeamSessionRef,
    pendingId: string,
    requestId: string,
    reply: TeamReply,
    signal: AbortSignal,
  ): Promise<void>;
}
export interface TeamAgentAdapter {
  current(): TeamAgentConnection | null;
  subscribe(listener: () => void): () => void;
}
