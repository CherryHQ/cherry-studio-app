import { v7 as uuidv7 } from 'uuid';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { AgentErrorView, AgentMessageView, AgentSessionView } from '@/shared/contracts/agent';

import type {
  AgentSessionStore,
  FinalizeAssistantMessageInput,
  ForkSessionInput,
  ForkSessionResult,
  ReserveInitialSubmissionInput,
  ReserveInitialSubmissionResult,
  ReserveSubmissionInput,
  ReserveSubmissionResult,
} from './AgentSessionStore';
import { interruptNonTerminalToolParts } from './messageSettlement';

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
): ReserveSubmissionResult {
  // Synchronous section: both message writes commit together or not at all.
  const timestamp = nowIso();
  const turnId = uuidv7();
  const userMessage: AgentMessageView = {
    id: uuidv7(),
    sessionId: input.sessionId,
    turnId,
    role: 'user',
    status: 'success',
    parts: cloneJson(input.userParts),
    usage: null,
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

  protected override onDestroy(): void {
    this.sessions.clear();
    this.messages.clear();
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
    // Mirrors the durable adapter's ON DELETE SET NULL: a fork outlives its
    // source and only loses the lineage claim.
    for (const [forkId, session] of this.sessions) {
      if (session.forkedFromSessionId === sessionId) {
        this.sessions.set(forkId, { ...session, forkedFromSessionId: null });
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

    this.sessions.set(session.id, session);
    this.messages.set(session.id, forkedTranscript);
    return { session: cloneJson(session), status: 'forked' };
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
    this.sessions.set(session.id, session);
    this.messages.set(session.id, transcript);
    return cloneJson({ ...reserved, session });
  }

  async reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult> {
    const transcript = this.messages.get(input.sessionId);
    if (!transcript) {
      throw new Error(`Cannot reserve a submission for an unknown session: ${input.sessionId}`);
    }
    return cloneJson(reserveInTranscript(transcript, input));
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

  async finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView> {
    for (const transcript of this.messages.values()) {
      const stored = transcript.find((entry) => entry.view.id === input.assistantMessageId);
      if (!stored) {
        continue;
      }
      // Synchronous section: message terminal state settles atomically
      // (invariant 5).
      stored.view = {
        ...stored.view,
        status: input.status,
        parts: cloneJson(input.parts),
        usage: input.usage === null ? null : cloneJson(input.usage),
        updatedAt: nowIso(),
      };
      stored.error = input.error === null ? null : cloneJson(input.error);
      stored.contextCheckpoint =
        input.status === 'success' && input.contextCheckpoint !== null
          ? cloneJson(input.contextCheckpoint)
          : null;
      return cloneJson(stored.view);
    }
    throw new Error(`Cannot finalize an unknown message: ${input.assistantMessageId}`);
  }

  async reconcileInterrupted(error: AgentErrorView): Promise<number> {
    let count = 0;
    for (const transcript of this.messages.values()) {
      for (const stored of transcript) {
        if (!UNSETTLED_MESSAGE_STATUSES.has(stored.view.status)) {
          continue;
        }
        stored.view = {
          ...stored.view,
          status: 'interrupted',
          parts: interruptNonTerminalToolParts(stored.view.parts, error.message),
          updatedAt: nowIso(),
        };
        if (stored.view.role === 'assistant') {
          stored.error = cloneJson(error);
          count += 1;
        }
      }
    }
    return count;
  }
}
