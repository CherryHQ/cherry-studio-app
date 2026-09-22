import type { MessageListItem } from '@/frontend/components/Message';
import type {
  AgentMessageView,
  AgentSubmitMessageInput,
  JsonValue,
} from '@/shared/contracts/agent';
import type { ResolvedFile } from '@/shared/contracts/file';

type Opaque<Tag extends string> = string & { readonly __tag: Tag };
export type QueryScope = Opaque<'conversation-scope'>;
export type MessageRef = Opaque<'conversation-message'>;
export type ExecutionRef = Opaque<'conversation-execution'>;
export type InteractionRef = Opaque<'conversation-interaction'>;
export type ResourceRef = Opaque<'conversation-resource'>;
export type AgentRef = Opaque<'conversation-agent'>;
export type WorkspaceRef = Opaque<'conversation-workspace'>;
export type HistoryVersion = Opaque<'conversation-history-version'>;
export type HistoryCursor = Opaque<'conversation-history-cursor'>;
export type CatalogCursor = Opaque<'conversation-catalog-cursor'>;
export type OperationId = Opaque<'conversation-operation'>;
export type DraftId = Opaque<'conversation-draft'>;

export type ConversationSourceRef = { kind: 'local' } | { kind: 'desktop'; connectionId: string };
export type ConversationRef = { source: ConversationSourceRef; sessionId: string };
export type Readable<T> = { getSnapshot(): T; subscribe(listener: () => void): () => void };
export type ConversationFailure = {
  code:
    | 'invalid-input'
    | 'conflict'
    | 'not-found'
    | 'not-authorized'
    | 'needs-repair'
    | 'offline'
    | 'version-expired'
    | 'unsupported'
    | 'resource-unavailable'
    | 'idempotency-conflict'
    | 'cancelled'
    | 'retired'
    | 'internal';
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
        | 'resource-unavailable'
        | 'retired';
    };
export type OperationOutcome<T> =
  | { state: 'applied'; value: T }
  | { state: 'pending'; operationId: OperationId }
  | { state: 'rejected'; failure: ConversationFailure }
  | { state: 'interrupted'; operationId: OperationId };
export type ConversationAction<Input, Output> = {
  availability: Availability;
  /** Admission outlives the caller. Reads use AbortSignal; mutations never use route cancellation. */
  execute(input: Input): Promise<OperationOutcome<Output>>;
};
export type ConversationInput = Pick<
  AgentSubmitMessageInput,
  'parts' | 'modelId' | 'reasoningEffort' | 'imageGeneration'
>;
export type InputPolicy = {
  attachments: boolean;
  pluginReferences: boolean;
  modelSelection: boolean;
  textLimit?: { unit: 'utf8-bytes' | 'utf16-units'; value: number };
};
export type Submission = {
  conversation: ConversationRef;
  userMessage?: MessageRef;
  execution?: ExecutionRef;
};
export type ConversationOperation = {
  id: OperationId;
  kind: 'start' | 'send' | 'cancel' | 'respond' | 'retry' | 'delete' | 'fork' | 'rename';
  state: 'pending' | 'applied' | 'rejected' | 'interrupted';
  conversation?: ConversationRef;
  draftId?: DraftId;
  /** Admitted input remains recoverable after navigation and explicit rejection. */
  input?: ConversationInput;
  recovery?: ConversationAction<void, void>;
  dismiss?: () => void;
  failure?: ConversationFailure;
};
export type ConversationFreshness =
  | { state: 'loading' }
  | { state: 'current' }
  | { state: 'cached'; reason: 'offline' | 'suspended' | 'refreshing' }
  | { state: 'unavailable'; failure: ConversationFailure }
  | { state: 'retired' };
export type ConversationActions = {
  inputPolicy: InputPolicy;
  send?: ConversationAction<ConversationInput, Submission>;
  rename?: ConversationAction<{ title: string }, void>;
  remove?: ConversationAction<void, void>;
};
export type ConversationExecution = {
  ref: ExecutionRef;
  state:
    | 'running'
    | 'awaiting-approval'
    | 'finalizing'
    | 'completed'
    | 'cancelled'
    | 'failed'
    | 'interrupted';
  cancel?: ConversationAction<void, void>;
};
export type ConversationInteraction = {
  execution?: ExecutionRef;
  ref: InteractionRef;
  kind: 'decision';
  title: string;
  state: 'pending' | 'approved' | 'denied' | 'expired';
  input: ResourceRef;
  respond?: ConversationAction<'approve' | 'deny', void>;
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
/** Reuse the full existing presentation model: citations, compaction, files, usage and model metadata survive. */
export type ConversationImageResult = {
  id: string;
  sessionId: string;
  createdAt: string;
  images: readonly { fileEntryId: string; mediaType: string; name: string }[];
};
export type ConversationMessage = {
  ref: MessageRef;
  key: string;
  state: AgentMessageView['status'];
  completeness: 'complete' | 'partial';
  display: MessageListItem;
  details?: ResourceRef;
  /** A completed image-model result that may become the composer editing target. */
  imageResult?: ConversationImageResult;
  tools?: readonly {
    key: string;
    title: string;
    state: 'streaming' | 'input-ready' | 'completed' | 'failed';
    input?: ResourceRef;
    output?: ResourceRef;
  }[];
  attachments?: readonly { key: string; name: string; mediaType?: string; resource: ResourceRef }[];
  actions: {
    retry?: ConversationAction<void, Submission>;
    remove?: ConversationAction<void, void>;
    fork?: ConversationAction<{ title?: string }, ConversationRef>;
  };
};
export type ConversationSnapshot = {
  agentId?: string;
  workspaceId?: string;
  title: string;
  freshness: ConversationFreshness;
  historyVersion?: HistoryVersion;
  liveMessages: readonly ConversationMessage[];
  executions: readonly ConversationExecution[];
  interactions: readonly ConversationInteraction[];
  actions: ConversationActions;
  enteringMessageKey?: string;
  retryingMessageKey?: string;
  hasHistoryBeforeExecution?: boolean;
  fork?: { boundaryMessageKey: string; source: ConversationRef };
};
export type HistoryPage = {
  items: readonly ConversationMessage[];
  older?: HistoryCursor;
  newer?: HistoryCursor;
};
export interface HistoryWindow {
  readonly scope: QueryScope;
  readonly version: HistoryVersion;
  readonly initial: HistoryPage;
  read(cursor: HistoryCursor, signal: AbortSignal): Promise<HistoryPage>;
  dispose(): void;
}
export interface ConversationHistory {
  openLatest(signal: AbortSignal): Promise<HistoryWindow>;
  openAround?: (message: MessageRef, signal: AbortSignal) => Promise<HistoryWindow>;
  prepareSelection(
    messages: readonly MessageRef[],
    signal: AbortSignal,
  ): Promise<TranscriptSnapshot>;
}
export type ResourceValue =
  | { kind: 'text'; text: string; complete: true }
  | { kind: 'json'; value: JsonValue; complete: true }
  | { kind: 'metadata'; name: string; mediaType?: string; byteLength?: string };
export type PreparedAsset = { file: ResolvedFile; release(): void };
export type TranscriptSnapshot = {
  title?: string;
  assistantName?: string;
  messages: readonly TranscriptMessage[];
  assets: readonly PreparedAsset[];
  release(): void;
};
export interface ConversationResources {
  read(ref: ResourceRef, signal: AbortSignal): Promise<ResourceValue>;
  materializer(
    ref: ResourceRef,
  ):
    | undefined
    | { availability: Availability; prepare(signal: AbortSignal): Promise<PreparedAsset> };
}
export interface ConversationSession {
  readonly ref: ConversationRef;
  readonly scope: QueryScope;
  readonly state: Readable<ConversationSnapshot>;
  readonly history: ConversationHistory;
  readonly resources: ConversationResources;
  readonly operations: Readable<readonly ConversationOperation[]>;
  activate(): () => void;
  refresh(signal: AbortSignal): Promise<void>;
  dispose(): void;
}
export type CatalogPage<T> = { items: readonly T[]; next?: CatalogCursor };
export type AgentSummary = {
  /** Stable source-local address for navigation; never a grant or capability. */
  id: string;
  ref: AgentRef;
  name: string;
  configuration: 'available' | 'unavailable' | 'unknown';
  avatar?: string | null;
  avatarUri?: string | null;
};
export type WorkspaceSummary = { ref: WorkspaceRef; id: string; name: string };
export type ConversationSummary = { ref: ConversationRef; title: string; updatedAt?: string };
export interface ConversationCatalog {
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
  prepareDraft(
    input: { agent: AgentRef; workspace?: WorkspaceRef; draftId: DraftId },
    signal: AbortSignal,
  ): Promise<ConversationDraft>;
}
export interface ConversationDraft {
  readonly id: DraftId;
  readonly state: Readable<{
    inputPolicy: InputPolicy;
    start: ConversationAction<ConversationInput, Submission>;
  }>;
  readonly operations: Readable<readonly ConversationOperation[]>;
  dispose(): void;
}
export interface ConversationSource {
  /** Stable identity/grant binding for unsent drafts; independent of Query lifetime. */
  readonly draftScope: string;
  readonly operations: Readable<readonly ConversationOperation[]>;
  readonly ref: ConversationSourceRef;
  readonly scope: QueryScope;
  readonly state: Readable<{ availability: Availability }>;
  readonly catalog: ConversationCatalog;
  openSession(ref: ConversationRef, signal: AbortSignal): Promise<ConversationSession>;
  dispose(): void;
}
