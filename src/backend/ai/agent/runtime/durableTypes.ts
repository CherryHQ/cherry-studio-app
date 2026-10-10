import type { TraceSpan } from '../../observability';
import type {
  RuntimeApproval,
  RuntimeArtifact,
  RuntimeContextCheckpoint,
  RuntimeDescriptor,
  RuntimeError,
  RuntimeHistoryTurn,
  RuntimeInputPart,
  RuntimeJsonValue,
  RuntimeModel,
  RuntimeModelPreflight,
  RuntimeOptions,
  RuntimeOutputPart,
  RuntimeTool,
  RuntimeToolRef,
  RuntimeUsage,
  RuntimeUsageReport,
  RuntimeMessagePart,
} from './types';

/** Portable storage capability supplied by composition; no Expo, data service, or Pi types. */
export type RuntimeSqlValue = null | number | bigint | string | Uint8Array;
export interface RuntimeSqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: RuntimeSqlValue[]): Promise<void>;
  get<Row extends object>(sql: string, ...params: RuntimeSqlValue[]): Promise<Row | undefined>;
  all<Row extends object>(sql: string, ...params: RuntimeSqlValue[]): Promise<Row[]>;
}
export interface RuntimeSqlDatabase extends RuntimeSqlExecutor {
  transaction<Value>(callback: (transaction: RuntimeSqlExecutor) => Promise<Value>): Promise<Value>;
  close(): Promise<void>;
}

export type RuntimeExecutionIdentity = { sessionId: string; turnId: string; requestId: string };
export type RuntimeUsageOwner =
  | RuntimeExecutionIdentity
  | { sessionId: string; turnId: null; requestId: null };

/** Callbacks are reconstructed for the current process; never serialized with a conversation. */
export type RuntimeExecutionPorts = {
  traceModel?(owner: RuntimeUsageOwner): Promise<TraceSpan | undefined>;
  assertExecutionAllowed(owner: RuntimeUsageOwner, signal: AbortSignal): Promise<void>;
  resolveTool(
    identity: RuntimeExecutionIdentity,
    ref: RuntimeToolRef,
    signal: AbortSignal,
  ): Promise<RuntimeTool>;
  requestApproval(
    identity: RuntimeExecutionIdentity,
    approval: RuntimeApproval,
    signal: AbortSignal,
  ): Promise<'approve' | 'deny'>;
  admitArtifacts(
    identity: RuntimeExecutionIdentity,
    artifacts: readonly RuntimeArtifact[],
    signal: AbortSignal,
  ): Promise<void>;
  recordUsage(owner: RuntimeUsageOwner, report: RuntimeUsageReport): Promise<void>;
};

export type RuntimeConversationConfiguration = {
  /** Direct image requests execute as a single unsafe capability, without a language-model request. */
  kind?: 'language' | 'image';
  model: RuntimeModel;
  instructions: string;
  options: RuntimeOptions;
  /** The current offered schema/catalog; execution resolves the owning durable run through ports. */
  tools: readonly RuntimeTool[];
};

export type RuntimeConversationSeed = {
  sessionId: string;
  /** Cherry-owned history revision. A different revision must never resume this working copy. */
  revision: number;
  configuration: RuntimeConversationConfiguration;
  history?: {
    history: RuntimeHistoryTurn[];
    contextCheckpoint: RuntimeContextCheckpoint | null;
    referencedFileEntryIds: readonly string[];
  };
};

/** Wall-clock facts of one run. Engine durations are monotonic; approval waits are Host-observed. */
export type RuntimeTurnTiming = {
  startedAt: number;
  completedAt?: number;
  tools: readonly {
    toolCallId: string;
    toolName: string;
    startedAt: number;
    completedAt: number;
  }[];
  approvals?: readonly {
    approvalId: string;
    toolCallId: string;
    toolName?: string;
    startedAt: number;
    completedAt?: number;
  }[];
};

/** Stable presentation IDs survive deduplicated admission, process recovery, and history forks. */
export type RuntimeDurableSubmission = {
  requestId: string;
  turnId: string;
  userMessageId: string;
  assistantMessageId: string;
  createdAt: number;
  input: RuntimeInputPart[];
  /** Completed tool prefix imported into a replacement working copy; never execute it again. */
  resume?: RuntimeMessagePart[];
  /** Original display parts and inference facts. Assistant/model/tool bodies belong to the engine. */
  metadata: { [key: string]: RuntimeJsonValue };
};

export type RuntimeDurableTurn = {
  identity: RuntimeExecutionIdentity;
  userMessageId: string;
  assistantMessageId: string;
  /** Opaque engine history boundaries; callers only pass them back to the same Runtime. */
  inputBoundary: string | null;
  answerBoundary: string | null;
  metadata: { [key: string]: RuntimeJsonValue };
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  parts: RuntimeOutputPart[];
  usage: RuntimeUsage | null;
  /** Size of the latest provider input, distinct from the sum of requests in this turn. */
  contextTokens?: number;
  error: RuntimeError | null;
  createdAt: number;
  updatedAt: number;
  /** Absent when no response has started, such as a queued input. */
  timing?: RuntimeTurnTiming;
  /** A history fork cut at the user input has no synthesized assistant placeholder. */
  hasAssistant: boolean;
};

export type RuntimeConversationSnapshot = {
  activeTurn: RuntimeDurableTurn | null;
  queue: readonly RuntimeDurableTurn[];
};

export type RuntimeConversationEvent =
  | { type: 'snapshot'; snapshot: RuntimeConversationSnapshot }
  | { type: 'turn.updated'; turn: RuntimeDurableTurn }
  | { type: 'queue.updated'; queue: readonly RuntimeDurableTurn[] };

/** Persistent execution working copies. Cherry owns the user transcript and its lifecycle. */
export interface DurableAgentRuntime {
  drainUsage(): Promise<void>;
  readonly descriptor: RuntimeDescriptor;
  preflightModel(model: RuntimeModel): Promise<RuntimeModelPreflight>;
  initialize(database: RuntimeSqlDatabase, ports: RuntimeExecutionPorts): Promise<void>;
  /** Enable scheduling only after business identities and capabilities have been reconstructed. */
  resume(): void;
  /** Native task demand, including background compaction; observing does not schedule work. */
  watchWork(listener: (active: boolean) => void): Promise<{
    active: boolean;
    unsubscribe(): Promise<void>;
  }>;
  close(): Promise<void>;
  sessions(): Promise<readonly { sessionId: string; revision: number }[]>;
  hasConversation(sessionId: string): Promise<boolean>;
  revision(sessionId: string): Promise<number | undefined>;
  unfinishedSessions(): Promise<readonly string[]>;
  configuration(sessionId: string): Promise<RuntimeConversationConfiguration>;
  resourceFileEntryIds(sessionId: string): Promise<readonly string[]>;
  ensureConversation(seed: RuntimeConversationSeed, signal?: AbortSignal): Promise<void>;
  configure(sessionId: string, configuration: RuntimeConversationConfiguration): Promise<void>;
  submit(sessionId: string, input: RuntimeDurableSubmission): Promise<RuntimeDurableTurn>;
  observe(
    sessionId: string,
    listener: (event: RuntimeConversationEvent) => void,
  ): Promise<{
    snapshot: RuntimeConversationSnapshot;
    unsubscribe(): Promise<void>;
  }>;
  history(
    sessionId: string,
    query: { limit: number; cursor?: string; requestIds?: readonly string[] },
  ): Promise<{
    turns: readonly RuntimeDurableTurn[];
    nextCursor?: string;
  }>;
  message(
    sessionId: string,
    messageId: string,
  ): Promise<{ turn: RuntimeDurableTurn; role: 'user' | 'assistant' } | undefined>;
  exportTurn(
    sessionId: string,
    requestId: string,
    options?: { currentContext?: boolean },
  ): Promise<{ contextCheckpoint: RuntimeContextCheckpoint | null }>;
  abort(sessionId: string): Promise<void>;
  /** Abort and retire the application binding through public APIs. File reclamation is separate. */
  discardConversation(sessionId: string): Promise<void>;
  withdraw(
    sessionId: string,
    requestId: string,
  ): Promise<'aborted' | 'already-placed' | 'settled' | 'not-found'>;
  hasUnfinishedWork(): Promise<boolean>;
}
