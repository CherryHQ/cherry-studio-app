import { v7 as uuidv7 } from 'uuid';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type {
  AgentErrorView,
  AgentMessageView,
  AgentSessionView,
  AgentSessionInput,
} from '@/shared/contracts/agent';

import type {
  AgentSessionStore,
  ConsumeSessionInput,
  ConsumeSessionInputResult,
  EnqueueSessionInput,
  FinalizeAssistantMessageInput,
  ForkSessionInput,
  ForkSessionResult,
  ReserveInitialSubmissionInput,
  ReserveInitialSubmissionResult,
  ReserveSubmissionInput,
  ReserveSubmissionResult,
  UpdateStreamingAssistantMessageInput,
  UpdateSessionInput,
} from './AgentSessionStore';
import {
  interruptNonTerminalToolParts,
  settleInterruptedAssistantParts,
} from './messageSettlement';

const UNSETTLED_MESSAGE_STATUSES = new Set<AgentMessageView['status']>(['pending', 'streaming']);

function nowIso(): string {
  return new Date().toISOString();
}

/** Values cross the store boundary by copy, matching row-mapping semantics. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** One stored message: the view plus the turn-level error column. */
type StoredMessage = {
  view: AgentMessageView;
  error: AgentErrorView | null;
  contextCheckpoint: unknown | null;
};

function createSessionView(input: {
  agentId: string;
  executionTarget?: AgentSessionView['executionTarget'];
  forkedFromSessionId?: string;
  title?: string;
  titleIsManual?: boolean;
}): AgentSessionView {
  const timestamp = nowIso();
  return {
    id: uuidv7(),
    agentId: input.agentId,
    executionTarget: input.executionTarget ?? { kind: 'local' },
    title: input.title ?? '',
    titleIsManual: input.titleIsManual ?? input.title !== undefined,
    forkBoundaryMessageId: null,
    forkedFromSessionId: input.forkedFromSessionId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/**
 * Reissues one source turn id per fork, keeping a submission's user/assistant
 * pair correlated while leaving no id shared with the source Session.
 */
function reissueTurnId(reissued: Map<string, string>, turnId: string | null): string | null {
  if (turnId === null) {
    return null;
  }

  const existing = reissued.get(turnId);
  if (existing !== undefined) {
    return existing;
  }

  const next = uuidv7();
  reissued.set(turnId, next);
  return next;
}

function reserveInTranscript(
  transcript: StoredMessage[],
  input: ReserveSubmissionInput,
  existingTurnId?: string,
): ReserveSubmissionResult {
  // Synchronous section: both message writes commit together or not at all.
  const timestamp = nowIso();
  const turnId = existingTurnId ?? uuidv7();
  const userMessage: AgentMessageView = {
    id: uuidv7(),
    sessionId: input.sessionId,
    turnId,
    role: 'user',
    status: 'success',
    parts: cloneJson(input.userParts),
    usage: null,
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const assistantMessage: AgentMessageView = {
    id: uuidv7(),
    sessionId: input.sessionId,
    turnId,
    role: 'assistant',
    status: 'pending',
    parts: [],
    usage: null,
    stats: null,
    modelId: input.modelId,
    inferenceSnapshot: {
      status: 'supported',
      snapshot: cloneJson(input.inferenceSnapshot),
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  transcript.push(
    { view: userMessage, error: null, contextCheckpoint: null },
    { view: assistantMessage, error: null, contextCheckpoint: null },
  );
  return { turnId, userMessage, assistantMessage };
}

/**
 * Process-local reference adapter for {@link AgentSessionStore}.
 *
 * Its state belongs to one `ApplicationHost` generation and is not durable
 * across app restarts. It remains useful as the Host's architecture-test
 * adapter after durable Mobile Agent persistence lands. Production composition
 * selects it only while that persistence (agent-persistence.md) is pending.
 *
 * @experimental Do not infer restart recovery from this adapter.
 */
@Injectable('AgentSessionStore')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('not-applicable')
export class InMemoryAgentSessionStore extends BaseService implements AgentSessionStore {
  private readonly sessions = new Map<string, AgentSessionView>();
  /** Insertion-ordered per Session, which is the transcript order. */
  private readonly messages = new Map<string, StoredMessage[]>();
  private readonly inputs = new Map<string, AgentSessionInput>();
  private readonly pausedQueues = new Set<string>();

  async enqueueInput(input: EnqueueSessionInput) {
    const existing = this.inputs.get(input.id);
    if (existing) {
      return { input: cloneJson(existing), created: false };
    }
    if (!this.sessions.has(input.sessionId)) {
      throw new Error(`Unknown Session: ${input.sessionId}`);
    }
    const position =
      [...this.inputs.values()].reduce(
        (last, item) => (item.sessionId === input.sessionId ? Math.max(last, item.position) : last),
        -1,
      ) + 1;
    const timestamp = nowIso();
    const queued: AgentSessionInput = {
      ...cloneJson(input),
      position,
      status: 'queued',
      reason: null,
      turnId: null,
      userMessageId: null,
      assistantMessageId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.inputs.set(input.id, queued);
    return { input: cloneJson(queued), created: true };
  }

  async getInput(inputId: string) {
    const input = this.inputs.get(inputId);
    return input ? cloneJson(input) : null;
  }

  async getInputQueue(sessionId: string) {
    return {
      isPaused: !this.sessions.has(sessionId) || this.pausedQueues.has(sessionId),
      inputs: cloneJson(
        [...this.inputs.values()]
          .filter(
            (input) =>
              input.sessionId === sessionId &&
              input.status !== 'consumed' &&
              input.status !== 'removed',
          )
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
      ),
    };
  }

  async setInputQueuePaused(sessionId: string, isPaused: boolean): Promise<void> {
    if (isPaused) {
      this.pausedQueues.add(sessionId);
    } else {
      this.pausedQueues.delete(sessionId);
    }
  }

  async updateInput(input: UpdateSessionInput) {
    const existing = this.inputs.get(input.id);
    if (
      !existing ||
      existing.sessionId !== input.sessionId ||
      !input.expectedStatus.includes(existing.status)
    ) {
      return null;
    }
    const updated = { ...existing, ...cloneJson(input.patch), updatedAt: nowIso() };
    this.inputs.set(input.id, updated);
    return cloneJson(updated);
  }

  async reorderInputs(sessionId: string, inputIds: string[]): Promise<boolean> {
    const queued = [...this.inputs.values()]
      .filter(
        (input) =>
          input.sessionId === sessionId &&
          (input.status === 'queued' || input.status === 'interrupted'),
      )
      .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
    const requested = new Set(inputIds);
    if (
      requested.size !== inputIds.length ||
      queued.length !== inputIds.length ||
      queued.some(({ id }) => !requested.has(id))
    ) {
      return false;
    }
    for (const [index, id] of inputIds.entries()) {
      const input = this.inputs.get(id)!;
      this.inputs.set(id, { ...input, position: queued[index]!.position, updatedAt: nowIso() });
    }
    return true;
  }

  async consumeInput(input: ConsumeSessionInput): Promise<ConsumeSessionInputResult> {
    const queued = this.inputs.get(input.inputId);
    const transcript = this.messages.get(input.sessionId);
    if (
      !queued ||
      !transcript ||
      queued.sessionId !== input.sessionId ||
      queued.status !== (input.continuation ? 'steering' : 'dispatching')
    ) {
      throw new Error(`Input is no longer available for consumption: ${input.inputId}`);
    }
    let previousAssistantMessage: AgentMessageView | null = null;
    if (input.continuation) {
      const previous = transcript.find(
        ({ view }) => view.id === input.continuation!.previousAssistant.assistantMessageId,
      );
      if (
        !previous ||
        previous.view.turnId !== input.continuation.turnId ||
        !UNSETTLED_MESSAGE_STATUSES.has(previous.view.status)
      ) {
        throw new Error('Steering requires the active assistant segment.');
      }
      previousAssistantMessage = this.finalizeStoredMessage({
        ...input.continuation.previousAssistant,
        contextCheckpoint: null,
      });
    } else if (
      transcript.some(
        ({ view }) => view.role === 'assistant' && UNSETTLED_MESSAGE_STATUSES.has(view.status),
      )
    ) {
      throw new Error('Session already has an active assistant segment.');
    }
    const reserved = reserveInTranscript(transcript, input, input.continuation?.turnId);
    this.inputs.set(input.inputId, {
      ...queued,
      status: 'consumed',
      reason: null,
      turnId: reserved.turnId,
      userMessageId: reserved.userMessage.id,
      assistantMessageId: reserved.assistantMessage.id,
      updatedAt: nowIso(),
    });
    const session = this.sessions.get(input.sessionId)!;
    this.sessions.set(input.sessionId, {
      ...session,
      updatedAt: reserved.assistantMessage.createdAt,
    });
    return cloneJson({ ...reserved, previousAssistantMessage });
  }

  protected override onDestroy(): void {
    this.sessions.clear();
    this.messages.clear();
    this.inputs.clear();
    this.pausedQueues.clear();
  }

  /** @internal Test and legacy-state fixture; product creation uses reserveInitialSubmission. */
  async createEmptySession(input: { agentId: string; title?: string }): Promise<AgentSessionView> {
    const session = createSessionView(input);
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return cloneJson(session);
  }

  async getSession(sessionId: string): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    return session ? cloneJson(session) : null;
  }

  async renameSession(sessionId: string, title: string): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    const renamed: AgentSessionView = {
      ...session,
      title,
      titleIsManual: true,
      updatedAt: nowIso(),
    };
    this.sessions.set(sessionId, renamed);
    return cloneJson(renamed);
  }

  async autoRenameSession(
    sessionId: string,
    expectedTitle: string,
    title: string,
  ): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.titleIsManual || session.title !== expectedTitle) {
      return null;
    }
    const renamed: AgentSessionView = {
      ...session,
      title,
      titleIsManual: false,
      updatedAt: nowIso(),
    };
    this.sessions.set(sessionId, renamed);
    return cloneJson(renamed);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.sessions.delete(sessionId)) {
      return false;
    }
    this.messages.delete(sessionId);
    this.pausedQueues.delete(sessionId);
    for (const [id, input] of this.inputs) {
      if (input.sessionId === sessionId) this.inputs.delete(id);
    }
    // Mirrors the durable adapter's ON DELETE SET NULL: a fork outlives its
    // source and only loses the lineage claim.
    for (const [forkId, session] of this.sessions) {
      if (session.forkedFromSessionId === sessionId) {
        this.sessions.set(forkId, {
          ...session,
          forkBoundaryMessageId: null,
          forkedFromSessionId: null,
          updatedAt: nowIso(),
        });
      }
    }
    return true;
  }

  async forkSession(input: ForkSessionInput): Promise<ForkSessionResult> {
    const source = this.sessions.get(input.sessionId);
    if (!source) {
      return { status: 'session-not-found' };
    }

    const transcript = this.messages.get(input.sessionId) ?? [];
    const anchorIndex = transcript.findIndex((stored) => stored.view.id === input.fromMessageId);
    if (anchorIndex < 0) {
      return { status: 'message-not-found' };
    }
    if (UNSETTLED_MESSAGE_STATUSES.has(transcript[anchorIndex].view.status)) {
      return { status: 'fork-point-unsettled' };
    }
    const anchorTurnId = transcript[anchorIndex].view.turnId;
    if (
      anchorTurnId !== null &&
      transcript.some(
        ({ view }) => view.turnId === anchorTurnId && UNSETTLED_MESSAGE_STATUSES.has(view.status),
      )
    ) {
      return { status: 'fork-point-unsettled' };
    }

    // Synchronous section: the Session and its copied transcript commit
    // together or not at all.
    const session = createSessionView({
      agentId: source.agentId,
      executionTarget: source.executionTarget,
      forkedFromSessionId: source.id,
      title: input.title ?? source.title,
      titleIsManual: source.titleIsManual,
    });
    const reissuedTurnIds = new Map<string, string>();
    const forkedTranscript = transcript
      .slice(0, anchorIndex + 1)
      .filter((stored) => !UNSETTLED_MESSAGE_STATUSES.has(stored.view.status))
      .map<StoredMessage>((stored) => ({
        // Runtime-private and anchored to a turn id this copy no longer
        // carries, so the fork replays full history instead.
        contextCheckpoint: null,
        error: stored.error === null ? null : cloneJson(stored.error),
        view: cloneJson({
          ...stored.view,
          id: uuidv7(),
          sessionId: session.id,
          turnId: reissueTurnId(reissuedTurnIds, stored.view.turnId),
          updatedAt: nowIso(),
        }),
      }));
    const forkBoundaryMessageId = forkedTranscript.at(-1)?.view.id;
    if (!forkBoundaryMessageId) {
      throw new Error('Fork transcript is missing its settled boundary message.');
    }
    const forkedSession = { ...session, forkBoundaryMessageId, updatedAt: nowIso() };

    this.sessions.set(session.id, forkedSession);
    this.messages.set(session.id, forkedTranscript);
    return { session: cloneJson(forkedSession), status: 'forked' };
  }

  async reserveInitialSubmission(
    input: ReserveInitialSubmissionInput,
  ): Promise<ReserveInitialSubmissionResult> {
    const session = createSessionView({
      agentId: input.agentId,
      executionTarget: input.executionTarget,
    });
    const transcript: StoredMessage[] = [];
    const reserved = reserveInTranscript(transcript, {
      sessionId: session.id,
      userParts: input.userParts,
      modelId: input.modelId,
      inferenceSnapshot: input.inferenceSnapshot,
    });
    const activeSession = { ...session, updatedAt: reserved.assistantMessage.createdAt };
    this.sessions.set(session.id, activeSession);
    this.messages.set(session.id, transcript);
    return cloneJson({ ...reserved, session: activeSession });
  }

  async reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult> {
    const transcript = this.messages.get(input.sessionId);
    if (!transcript) {
      throw new Error(`Cannot reserve a submission for an unknown session: ${input.sessionId}`);
    }
    const reserved = reserveInTranscript(transcript, input);
    const session = this.sessions.get(input.sessionId);
    if (session) {
      this.sessions.set(input.sessionId, {
        ...session,
        updatedAt: reserved.assistantMessage.createdAt,
      });
    }
    return cloneJson(reserved);
  }

  async listMessages(sessionId: string): Promise<AgentMessageView[]> {
    return cloneJson((this.messages.get(sessionId) ?? []).map((stored) => stored.view));
  }

  async loadRuntimeTurnContext(sessionId: string, afterTurnId: string | null) {
    const transcript = this.messages.get(sessionId) ?? [];
    let anchorIndex = -1;
    if (afterTurnId !== null) {
      for (let index = transcript.length - 1; index >= 0; index -= 1) {
        if (transcript[index]?.view.turnId === afterTurnId) {
          anchorIndex = index;
          break;
        }
      }
    }
    const anchorFound = afterTurnId === null || anchorIndex >= 0;
    const history = (
      anchorFound && afterTurnId !== null ? transcript.slice(anchorIndex + 1) : transcript
    ).map((stored) => stored.view);
    const referencedFileEntryIds = [
      ...new Set(
        transcript.flatMap(({ view }) =>
          view.parts.flatMap((part) => (part.type === 'file' ? [part.fileEntryId] : [])),
        ),
      ),
    ].sort();
    const sessionTurnIds = [
      ...new Set(transcript.flatMap(({ view }) => (view.turnId === null ? [] : [view.turnId]))),
    ].sort();

    return cloneJson({
      anchorFound,
      hasMessages: transcript.length > 0,
      history,
      referencedFileEntryIds,
      sessionTurnIds,
    });
  }

  async getLatestContextCheckpoint(sessionId: string) {
    const transcript = this.messages.get(sessionId) ?? [];
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const stored = transcript[index];
      if (stored?.view.role === 'assistant' && stored.contextCheckpoint !== null) {
        return cloneJson({
          assistantMessageId: stored.view.id,
          checkpoint: stored.contextCheckpoint,
        });
      }
    }
    return null;
  }

  async updateStreamingAssistantMessage(
    input: UpdateStreamingAssistantMessageInput,
  ): Promise<void> {
    for (const transcript of this.messages.values()) {
      const stored = transcript.find((entry) => entry.view.id === input.assistantMessageId);
      if (!stored) {
        continue;
      }
      if (!UNSETTLED_MESSAGE_STATUSES.has(stored.view.status)) {
        return;
      }
      stored.view = {
        ...stored.view,
        status: 'streaming',
        parts: cloneJson(input.parts),
        updatedAt: nowIso(),
      };
      return;
    }
  }

  async finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView> {
    return this.finalizeStoredMessage(input);
  }

  private finalizeStoredMessage(input: FinalizeAssistantMessageInput): AgentMessageView {
    for (const [sessionId, transcript] of this.messages) {
      const stored = transcript.find((entry) => entry.view.id === input.assistantMessageId);
      if (!stored) {
        continue;
      }
      // Synchronous section: message terminal state settles atomically
      // (invariant 5).
      const updatedAt = nowIso();
      stored.view = {
        ...stored.view,
        status: input.status,
        parts: cloneJson(input.parts),
        usage: input.usage === null ? null : cloneJson(input.usage),
        stats: { ...stored.view.stats, ...cloneJson(input.runtimeStats) },
        updatedAt,
      };
      stored.error = input.error === null ? null : cloneJson(input.error);
      stored.contextCheckpoint =
        input.status === 'success' && input.contextCheckpoint !== null
          ? cloneJson(input.contextCheckpoint)
          : null;
      const session = this.sessions.get(sessionId);
      if (session) {
        this.sessions.set(sessionId, { ...session, updatedAt });
      }
      return cloneJson(stored.view);
    }
    throw new Error(`Cannot finalize an unknown message: ${input.assistantMessageId}`);
  }

  async reconcileInterrupted(error: AgentErrorView): Promise<AgentMessageView[]> {
    for (const [sessionId, transcript] of this.messages) {
      if (transcript.some(({ view }) => UNSETTLED_MESSAGE_STATUSES.has(view.status)))
        this.pausedQueues.add(sessionId);
    }
    for (const [id, input] of this.inputs) {
      if (input.status !== 'consumed' && input.status !== 'removed')
        this.pausedQueues.add(input.sessionId);
      if (input.status === 'dispatching' || input.status === 'steering') {
        this.inputs.set(id, {
          ...input,
          status: 'interrupted',
          reason: 'interrupted',
          updatedAt: nowIso(),
        });
      }
    }
    const reconciled: AgentMessageView[] = [];
    for (const transcript of this.messages.values()) {
      for (const stored of transcript) {
        if (!UNSETTLED_MESSAGE_STATUSES.has(stored.view.status)) {
          continue;
        }
        const interruptedParts =
          stored.view.role === 'assistant'
            ? settleInterruptedAssistantParts(
                stored.view.parts,
                error,
                `error-${stored.view.turnId ?? stored.view.id}`,
              )
            : interruptNonTerminalToolParts(stored.view.parts, error.message);
        stored.view = {
          ...stored.view,
          status: 'interrupted',
          parts: interruptedParts,
          updatedAt: nowIso(),
        };
        if (stored.view.role === 'assistant') {
          stored.error = cloneJson(error);
          reconciled.push(cloneJson(stored.view));
        }
      }
    }
    return reconciled;
  }
}
