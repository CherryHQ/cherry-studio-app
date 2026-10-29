import type { AgentReplyPartEdit } from '@/shared/contracts/agent';
import { MAX_PARALLEL_ANSWERS } from '@/shared/contracts/agent/inputs';

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
  RuntimeWebTools,
} from './types';

/** Provider name of the Host tool that runs an explicitly submitted image request. */
export const DURABLE_IMAGE_TOOL_NAME = 'cherry_generate_image';

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

/**
 * One engine working copy of a Cherry Session. A Session whose message tree
 * branches keeps up to {@link LANES_PER_SESSION} copies in fixed slots; slot 0
 * is the copy every Session had before branching. Copies are disposable: the
 * Host rebuilds a missing one from Cherry history.
 *
 * A lane is an object, not a string, so it can never be passed where a Cherry
 * Session id is expected.
 */
export type RuntimeLane = Readonly<{ sessionId: string; slot: number }>;
/** One slot per parallel answer of a question. */
export const LANES_PER_SESSION = MAX_PARALLEL_ANSWERS;
export function runtimeLane(sessionId: string, slot = 0): RuntimeLane {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= LANES_PER_SESSION)
    throw new Error(`Invalid working copy slot: ${slot}`);
  return { sessionId, slot };
}
export function sameLane(a: RuntimeLane, b: RuntimeLane) {
  return a.sessionId === b.sessionId && a.slot === b.slot;
}
/** Stable string key for maps and engine storage. Slot 0 keeps the bare Session id. */
export function laneKey({ sessionId, slot }: RuntimeLane): string {
  return slot === 0 ? sessionId : `${sessionId}#${slot}`;
}
export function parseLaneKey(key: string): RuntimeLane {
  const index = key.lastIndexOf('#');
  return index < 0
    ? runtimeLane(key)
    : runtimeLane(key.slice(0, index), Number(key.slice(index + 1)));
}

/** `sessionId` is always the Cherry Session; `slot` names the working copy that runs the input. */
export type RuntimeExecutionIdentity = RuntimeLane & { turnId: string; requestId: string };
export type RuntimeUsageOwner =
  | RuntimeExecutionIdentity
  | (RuntimeLane & { turnId: null; requestId: null });

/** Isolated script transport supplied by the Host; no platform or engine imports cross this port. */
export type RuntimeScriptSandbox = {
  fingerprint: string;
  startBridge(input: {
    setup: string;
    data: string;
    clock: { startedAt: number; seed: number };
    memoryBytes: number;
    /** Aborting cancels the run; `result` settles after native cleanup. */
    signal: AbortSignal;
    onMessage(message: string): void;
  }): Promise<{
    post(message: string): void;
    /** Empty on normal termination, otherwise a native error description. */
    result: Promise<string>;
  }>;
};

/** Callbacks are reconstructed for the current process; never serialized with a conversation. */
export type RuntimeExecutionPorts = {
  scriptSandbox?: RuntimeScriptSandbox;
  writeToolOutput?(
    identity: RuntimeExecutionIdentity,
    output: { name: string; data: string | Uint8Array },
    signal: AbortSignal,
  ): Promise<RuntimeArtifact>;
  /** The shared storage session closed itself; reopen its working copies before accepting work. */
  onFailure?(error: RuntimeError): void;
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
  /** Host-owned replaceable system sections, seeded once for this configuration. */
  initialInstructions?: readonly { key: string; text: string }[];
  options: RuntimeOptions;
  /** The current offered schema/catalog; execution resolves the owning durable run through ports. */
  tools: readonly RuntimeTool[];
  /** Absent when the Agent may not use the web; the Runtime then never adds a native web tool. */
  webTools?: RuntimeWebTools;
};

export type RuntimeConversationSeed = {
  lane: RuntimeLane;
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
  /** A provider attempt failed and the engine is retrying it automatically. */
  isRetrying?: boolean;
  /** Repeated process interruptions paused execution; the input is still durable. */
  isPaused?: boolean;
};

export type RuntimeConversationSnapshot = {
  activeTurn: RuntimeDurableTurn | null;
  queue: readonly RuntimeDurableTurn[];
  contextStatus?: 'compacting' | 'compaction-failed' | null;
};

export type RuntimeConversationEvent =
  | { type: 'snapshot'; snapshot: RuntimeConversationSnapshot }
  | { type: 'turn.updated'; turn: RuntimeDurableTurn }
  | { type: 'context.updated'; status: 'compacting' | 'compaction-failed' | null }
  | { type: 'queue.updated'; queue: readonly RuntimeDurableTurn[] };

/** Persistent execution working copies. Cherry owns the user transcript and its lifecycle. */
export interface DurableAgentRuntime {
  drainUsage(): Promise<void>;
  readonly descriptor: RuntimeDescriptor;
  preflightModel(model: RuntimeModel): Promise<RuntimeModelPreflight>;
  initialize(
    database: RuntimeSqlDatabase,
    ports: RuntimeExecutionPorts,
    signal?: AbortSignal,
  ): Promise<void>;
  /** Enable scheduling only after business identities and capabilities have been reconstructed. */
  resume(): void;
  /** Native task demand, including background compaction; observing does not schedule work. */
  watchWork(listener: (active: boolean) => void): Promise<{
    active: boolean;
    unsubscribe(): Promise<void>;
  }>;
  close(): Promise<void>;
  /** Every bound working copy; a full scan for recovery and maintenance only. */
  sessions(): Promise<readonly { lane: RuntimeLane; revision: number }[]>;
  /** The bound working copies of one Session, by slot. */
  lanes(sessionId: string): Promise<readonly { lane: RuntimeLane; revision: number }[]>;
  hasConversation(lane: RuntimeLane): Promise<boolean>;
  revision(lane: RuntimeLane): Promise<number | undefined>;
  unfinishedLanes(): Promise<readonly RuntimeLane[]>;
  configuration(lane: RuntimeLane): Promise<RuntimeConversationConfiguration>;
  resourceFileEntryIds(lane: RuntimeLane): Promise<readonly string[]>;
  /**
   * Returns the copy's newest history boundary, from which other lanes may fork;
   * undefined while it holds no history.
   */
  ensureConversation(
    seed: RuntimeConversationSeed,
    signal?: AbortSignal,
  ): Promise<string | undefined>;
  /**
   * Natively forks `from.lane` at a boundary it returned into the new lane
   * `seed.lane`, which then continues from there with its own configuration.
   */
  forkConversation(
    seed: Omit<RuntimeConversationSeed, 'history'> & {
      from: { lane: RuntimeLane; boundary: string };
      /** Replaces source grants with the selected prefix and current input's grants. */
      referencedFileEntryIds: readonly string[];
    },
    signal?: AbortSignal,
  ): Promise<void>;
  configure(lane: RuntimeLane, configuration: RuntimeConversationConfiguration): Promise<void>;
  /**
   * Replaces answer text parts anywhere in this copy's history without replaying tools or changing
   * provider affinity. Undefined means this copy cannot represent the edit and Cherry must rebuild
   * it. On success, atomically advances the binding to revision + 1 before Cherry commits the same
   * history revision. A compacted copy returns its refreshed context for its newest answer.
   */
  editReply(
    lane: RuntimeLane,
    input: { messageId: string; revision: number; parts: readonly AgentReplyPartEdit[] },
  ): Promise<
    | {
        contextCheckpoint: {
          assistantMessageId: string;
          checkpoint: RuntimeContextCheckpoint;
        } | null;
      }
    | undefined
  >;
  submit(lane: RuntimeLane, input: RuntimeDurableSubmission): Promise<RuntimeDurableTurn>;
  observe(
    lane: RuntimeLane,
    listener: (event: RuntimeConversationEvent) => void,
  ): Promise<{
    snapshot: RuntimeConversationSnapshot;
    unsubscribe(): Promise<void>;
  }>;
  history(
    lane: RuntimeLane,
    query: { limit: number; cursor?: string; requestIds?: readonly string[] },
  ): Promise<{
    turns: readonly RuntimeDurableTurn[];
    nextCursor?: string;
  }>;
  message(
    lane: RuntimeLane,
    messageId: string,
  ): Promise<{ turn: RuntimeDurableTurn; role: 'user' | 'assistant' } | undefined>;
  exportTurn(
    lane: RuntimeLane,
    requestId: string,
    options?: { currentContext?: boolean },
  ): Promise<{ contextCheckpoint: RuntimeContextCheckpoint | null }>;
  abort(lane: RuntimeLane): Promise<void>;
  /** Abort and retire the application binding through public APIs. File reclamation is separate. */
  discardConversation(lane: RuntimeLane): Promise<void>;
  withdraw(
    lane: RuntimeLane,
    requestId: string,
  ): Promise<'aborted' | 'already-placed' | 'settled' | 'not-found'>;
  hasUnfinishedWork(): Promise<boolean>;
}
