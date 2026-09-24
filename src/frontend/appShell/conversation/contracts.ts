import type { MessageListItem } from '@/frontend/components/Message';
import type {
  AgentMessageView,
  AgentUserQuestion,
  AgentUserAnswer,
  JsonValue,
} from '@/shared/contracts/agent';
import type { ExecutionFailure } from '@/shared/contracts/aiFailure';
import type { InteractionResponse, InteractionQuestion } from '@/shared/contracts/interaction';

/**
 * Shared consumption contract: what the chat workspace, sidebar and transcript export read from
 * either conversation source. It carries no session lifecycle, history window, resource handle or
 * operation journal; those belong to the source that needs them.
 */
type Opaque<Tag extends string> = string & { readonly __tag: Tag };
export type QueryScope = Opaque<'conversation-scope'>;
export type AgentRef = Opaque<'conversation-agent'>;
export type WorkspaceRef = Opaque<'conversation-workspace'>;
export type CatalogCursor = Opaque<'conversation-catalog-cursor'>;

export type ConversationSourceRef = { kind: 'local' } | { kind: 'desktop'; connectionId: string };
export type ConversationRef = { source: ConversationSourceRef; sessionId: string };
export type Readable<T> = { getSnapshot(): T; subscribe(listener: () => void): () => void };
export type ConversationFailure = {
  code:
    | 'target-unavailable'
    | 'invalid-input'
    | 'conflict'
    | 'not-found'
    | 'not-authorized'
    | 'needs-repair'
    | 'offline'
    | 'version-expired'
    | 'unsupported'
    | 'upgrade-required'
    | 'resource-unavailable'
    | 'idempotency-conflict'
    | 'cancelled'
    | 'retired'
    | 'internal';
  detail?: { code: string; message?: string };
  retry: 'read-again' | 'revise-input' | 'repair-source' | 'none';
};
export type Availability =
  | { state: 'enabled' }
  | {
      state: 'disabled';
      reason:
        | 'offline'
        | 'suspended'
        | 'synchronizing'
        | 'busy'
        | 'not-authorized'
        | 'needs-repair'
        | 'model-unavailable'
        | 'workspace-required'
        | 'upgrade-required'
        | 'resource-unavailable'
        | 'retired';
    };
/** Local execution settles in-process; only a desktop command can stay pending or interrupted. */
export type OperationOutcome<T> =
  | { state: 'applied'; value: T }
  | { state: 'pending'; operationId: string }
  | { state: 'rejected'; failure: ConversationFailure }
  | { state: 'interrupted'; operationId: string };
export type ConversationAction<Input, Output> = {
  availability: Availability;
  /** Admission outlives the caller. Reads use AbortSignal; mutations never use route cancellation. */
  execute(input: Input): Promise<OperationOutcome<Output>>;
};
export type ConversationFreshness =
  | { state: 'loading' }
  | { state: 'current' }
  | { state: 'cached'; reason: 'offline' | 'suspended' | 'refreshing' }
  | { state: 'unavailable'; failure: ConversationFailure }
  | { state: 'retired' };
export type ConversationExecution = {
  id: string;
  failure?: ExecutionFailure;
  persistenceFailure?: ExecutionFailure;
  state:
    | 'running'
    | 'awaiting-approval'
    | 'awaiting-input'
    | 'finalizing'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'interrupted';
  cancel?: ConversationAction<void, void>;
};
export type ResourceValue =
  | { kind: 'user-question'; question: AgentUserQuestion }
  | { kind: 'question'; questions: readonly InteractionQuestion[] }
  | { kind: 'text'; text: string; complete: true }
  | { kind: 'json'; value: JsonValue; complete: true }
  | { kind: 'metadata'; name: string; mediaType?: string; byteLength?: string };
/** In-process values arrive inline; desktop-owned bytes are read on demand under a stable key. */
export type ResourceRead =
  | { kind: 'inline'; value: ResourceValue }
  | { kind: 'deferred'; key: string; read(signal: AbortSignal): Promise<ResourceValue> };
export type ConversationInteractionResponse =
  | InteractionResponse
  | { kind: 'user-answer'; answer: AgentUserAnswer };
export type ConversationInteraction = {
  execution?: string;
  id: string;
  kind: 'decision' | 'question';
  title: string;
  state: 'pending' | 'approved' | 'denied' | 'expired';
  input: ResourceRead;
  respond?: ConversationAction<ConversationInteractionResponse, void>;
};
/** Pure export values, never a deferred remote resource or an executable tool. */
export type TranscriptMessage = Pick<AgentMessageView, 'id' | 'role' | 'status' | 'stats'> & {
  parts: (
    | AgentMessageView['parts'][number]
    | { type: 'tool-summary'; id: string; displayName: string }
  )[];
  createdAt?: string;
  attachments?: readonly { name: string; mediaType?: string }[];
};
export type ConversationImageResult = {
  id: string;
  sessionId: string;
  createdAt: string;
  images: readonly { fileEntryId: string; mediaType: string; name: string }[];
};
export type ConversationMessage = {
  key: string;
  state: AgentMessageView['status'];
  completeness: 'complete' | 'partial';
  display: MessageListItem;
  /** A completed image-model result that may become the composer editing target. */
  imageResult?: ConversationImageResult;
  tools?: readonly {
    key: string;
    title: string;
    state: 'streaming' | 'input-ready' | 'completed' | 'failed';
    input?: ResourceRead;
    output?: ResourceRead;
  }[];
  attachments?: readonly { key: string; name: string; mediaType?: string }[];
  /** Unsupported actions are absent; temporary unavailability is explicit. */
  actions: {
    retry?: ConversationAction<void, void>;
    remove?: ConversationAction<void, void>;
    fork?: ConversationAction<{ title?: string }, ConversationRef>;
  };
};
export type ConversationSnapshot = {
  agentId?: string;
  workspaceId?: string;
  workspaceKind?: 'registered' | 'system';
  title: string;
  freshness: ConversationFreshness;
  liveMessages: readonly ConversationMessage[];
  executions: readonly ConversationExecution[];
  interactions: readonly ConversationInteraction[];
  enteringMessageKey?: string;
  retryingMessageKey?: string;
  hasHistoryBeforeExecution?: boolean;
};
/** One paginated transcript window as the workspace consumes it; each source owns its hook. */
export type ConversationHistoryView = {
  dataKey: string;
  messages: readonly ConversationMessage[];
  error?: Error;
  isLoadingInitial: boolean;
  isRefreshing: boolean;
  isLoadingOlder: boolean;
  isLoadingNewer: boolean;
  hasNewerMessages: boolean;
  hasOlderMessages: boolean;
  initialScrollTarget?: 'end' | { messageId: string };
  loadOlder(): Promise<void>;
  loadNewer(): Promise<void>;
  retry(): Promise<void>;
  returnToLatest?: () => void;
};
export type TranscriptSnapshot = {
  title?: string;
  assistantName?: string;
  messages: readonly TranscriptMessage[];
};
export type CatalogPage<T> = { items: readonly T[]; next?: CatalogCursor };
export type AgentSummary = {
  /** Stable source-local address for navigation; never a grant or capability. */
  id: string;
  ref: AgentRef;
  name: string;
  configuration: 'available' | 'unavailable' | 'unknown';
  modelName?: string | null;
  emoji?: string;
  avatar?: string | null;
  avatarUri?: string | null;
};
export type WorkspaceSummary =
  | { ref: WorkspaceRef; id: string; name: string; kind?: 'registered' }
  | { ref: WorkspaceRef; kind: 'system'; id?: never; name?: never };
export type ConversationSummary = {
  ref: ConversationRef;
  agentId?: string;
  title: string;
  updatedAt?: string;
};
export type ConversationListStatus =
  | 'running'
  | 'awaiting-approval'
  | 'awaiting-input'
  | 'failed'
  | 'unread';
/** Lightweight list metadata/actions. Does not open a transcript observation. */
export type ConversationPreview = {
  status?: Readable<ConversationListStatus | undefined>;
  rename?: ConversationAction<{ title: string }, void>;
  remove?: ConversationAction<void, void>;
};
export interface ConversationCatalog {
  /** Stable metadata namespace; excludes runtime resources, workspace choices and actions. */
  readonly cacheScope?: QueryScope;
  subscribe?(listener: (kind: 'agents' | 'sessions') => void): () => void;
  readSession?(ref: ConversationRef, signal: AbortSignal): Promise<ConversationSummary>;
  previewSession?(ref: ConversationRef): ConversationPreview;
  listAgents(
    cursor: CatalogCursor | undefined,
    signal: AbortSignal,
  ): Promise<CatalogPage<AgentSummary>>;
  listSessions(
    filter: { agent?: AgentRef },
    cursor: CatalogCursor | undefined,
    signal: AbortSignal,
  ): Promise<CatalogPage<ConversationSummary>>;
  listWorkspaces?: (
    agent: AgentRef,
    cursor: CatalogCursor | undefined,
    signal: AbortSignal,
  ) => Promise<CatalogPage<WorkspaceSummary>>;
}
/** A catalog owner for the sidebar and Agent picker. Session observation is source-specific. */
export interface ConversationSource {
  readonly ref: ConversationSourceRef;
  readonly scope: QueryScope;
  readonly state: Readable<{ availability: Availability }>;
  readonly catalog: ConversationCatalog;
  dispose(): void;
}
