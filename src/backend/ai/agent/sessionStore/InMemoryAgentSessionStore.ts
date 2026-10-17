import { v7 as uuidv7 } from 'uuid';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { AgentErrorView, AgentMessageView, AgentSessionView } from '@/shared/contracts/agent';

import type { RuntimeContextCheckpoint } from '../runtime';
import type {
  AgentSessionStore,
  DeleteTurnInput,
  DeleteTurnResult,
  FinalizeAssistantMessageInput,
  ForkSessionInput,
  ForkSessionResult,
  ReserveAnswerInput,
  ReserveInitialSubmissionInput,
  ReserveInitialSubmissionResult,
  ReserveRetryInput,
  ReserveSubmissionInput,
  ReserveSubmissionResult,
} from './AgentSessionStore';
import { finalizeMessageStats } from './messageSettlement';
import { collectSkillActivations } from './skillActivations';

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
  id?: string;
  agentId: string;
  workspaceFolderId?: string | null;
  forkedFromSessionId?: string;
  name?: string;
  isNameManuallyEdited?: boolean;
}): AgentSessionView {
  const timestamp = nowIso();
  return {
    id: input.id ?? uuidv7(),
    agentId: input.agentId,
    ...(input.workspaceFolderId !== undefined
      ? { workspaceFolderId: input.workspaceFolderId }
      : {}),
    name: input.name ?? '',
    isNameManuallyEdited: input.isNameManuallyEdited ?? input.name !== undefined,
    forkBoundaryMessageId: null,
    forkedFromSessionId: input.forkedFromSessionId ?? null,
    activeNodeId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** The payload stays opaque; only the anchor the Host itself validates is read. */
function readCheckpointAnchorTurnId(checkpoint: unknown): string | null {
  if (typeof checkpoint !== 'object' || checkpoint === null || !('anchorTurnId' in checkpoint)) {
    return null;
  }
  const { anchorTurnId } = checkpoint;
  return typeof anchorTurnId === 'string' ? anchorTurnId : null;
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
  // Synchronous section: all message writes commit together or not at all.
  const timestamp = nowIso();
  const turnId = uuidv7();
  const userMessage: AgentMessageView = {
    id: input.userMessageId,
    sessionId: input.sessionId,
    parentId: input.parentMessageId ?? null,
    siblingsGroupId: 0,
    turnId,
    role: 'user',
    status: 'success',
    parts: cloneJson(input.userParts),
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const answers = [input, ...(input.additionalReplies ?? [])];
  const siblingsGroupId =
    answers.length > 1
      ? Math.max(0, ...transcript.map(({ view }) => view.siblingsGroupId ?? 0)) + 1
      : 0;
  const [assistantMessage, ...additionalAssistantMessages] = answers.map(
    (answer): AgentMessageView => ({
      id: answer.assistantMessageId,
      sessionId: input.sessionId,
      parentId: userMessage.id,
      siblingsGroupId,
      turnId,
      role: 'assistant',
      status: 'pending',
      parts: [],
      stats: null,
      modelId: answer.modelId,
      inferenceSnapshot: { status: 'supported', snapshot: cloneJson(answer.inferenceSnapshot) },
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
  );
  transcript.push(
    { view: userMessage, error: null, contextCheckpoint: null },
    { view: assistantMessage, error: null, contextCheckpoint: null },
    ...additionalAssistantMessages.map((view) => ({ view, error: null, contextCheckpoint: null })),
  );
  return { turnId, userMessage, assistantMessage, additionalAssistantMessages };
}

/** Ancestor chain ending at `through`, oldest first; undefined selects the active leaf. */
function pathOf(
  transcript: readonly StoredMessage[],
  session: AgentSessionView | undefined,
  through?: string | null,
): StoredMessage[] {
  const byId = new Map(transcript.map((stored) => [stored.view.id, stored]));
  const path: StoredMessage[] = [];
  let id = through === undefined ? (session?.activeNodeId ?? null) : through;
  while (id) {
    const stored = byId.get(id);
    if (!stored) break;
    path.unshift(stored);
    id = stored.view.parentId ?? null;
  }
  return path;
}

/** Newest leaf below `messageId`, the message itself when it has no children; null for any. */
function newestLeaf(transcript: readonly StoredMessage[], messageId: string | null): string | null {
  // Creation order lists every parent before its children.
  const below = new Set<string | null>([messageId]);
  for (const { view } of transcript) if (below.has(view.parentId ?? null)) below.add(view.id);
  const parents = new Set(transcript.map(({ view }) => view.parentId ?? null));
  const leaves = transcript.filter(({ view }) => below.has(view.id) && !parents.has(view.id));
  return leaves.at(-1)?.view.id ?? messageId;
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
  private readonly runtimeRevisions = new Map<string, number>();
  /** Insertion-ordered per Session, which is the transcript order. */
  private readonly messages = new Map<string, StoredMessage[]>();

  async listUnsettledAssistantMessages() {
    const rows: { sessionId: string; assistantMessageId: string; turnId: string | null }[] = [];
    for (const [sessionId, list] of this.messages)
      for (const { view } of list)
        if (view.role === 'assistant' && UNSETTLED_MESSAGE_STATUSES.has(view.status))
          rows.push({ sessionId, assistantMessageId: view.id, turnId: view.turnId });
    return rows;
  }

  protected override onDestroy(): void {
    this.sessions.clear();
    this.runtimeRevisions.clear();
    this.messages.clear();
  }

  /** @internal Test and legacy-state fixture; product creation uses reserveInitialSubmission. */
  async createEmptySession(input: { agentId: string; name?: string }): Promise<AgentSessionView> {
    const session = createSessionView(input);
    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return cloneJson(session);
  }

  async getSession(sessionId: string): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    return session ? cloneJson(session) : null;
  }

  async getRuntimeRevision(sessionId: string): Promise<number | null> {
    return this.sessions.has(sessionId) ? (this.runtimeRevisions.get(sessionId) ?? 0) : null;
  }

  async renameSession(sessionId: string, name: string): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    const renamed: AgentSessionView = {
      ...session,
      name,
      isNameManuallyEdited: true,
      updatedAt: nowIso(),
    };
    this.sessions.set(sessionId, renamed);
    return cloneJson(renamed);
  }

  async autoRenameSession(
    sessionId: string,
    expectedName: string,
    name: string,
  ): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    if (!session || session.isNameManuallyEdited || session.name !== expectedName) {
      return null;
    }
    const renamed: AgentSessionView = {
      ...session,
      name,
      isNameManuallyEdited: false,
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
    this.runtimeRevisions.delete(sessionId);
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
    const anchor = transcript.find((stored) => stored.view.id === input.fromMessageId);
    if (!anchor) {
      return { status: 'message-not-found' };
    }
    if (UNSETTLED_MESSAGE_STATUSES.has(anchor.view.status)) {
      return { status: 'fork-point-unsettled' };
    }

    // Synchronous section: the Session and its copied transcript commit
    // together or not at all.
    const session = createSessionView({
      agentId: source.agentId,
      forkedFromSessionId: source.id,
      name: input.name ?? source.name,
      isNameManuallyEdited: source.isNameManuallyEdited,
      workspaceFolderId: source.workspaceFolderId,
    });
    const reissuedTurnIds = new Map<string, string>();
    const copied = pathOf(transcript, source, anchor.view.id).filter(
      (stored) => !UNSETTLED_MESSAGE_STATUSES.has(stored.view.status),
    );
    let parentId: string | null = null;
    const forkedTranscript = copied.map<StoredMessage>((stored) => {
      const id = uuidv7();
      const view = cloneJson({
        ...stored.view,
        id,
        parentId,
        siblingsGroupId: 0,
        sessionId: session.id,
        turnId: reissueTurnId(reissuedTurnIds, stored.view.turnId),
        updatedAt: nowIso(),
      });
      parentId = id;
      // Runtime-private and anchored to a turn id this copy no longer
      // carries, so the fork replays full history instead.
      return {
        contextCheckpoint: null,
        error: stored.error === null ? null : cloneJson(stored.error),
        view,
      };
    });
    const forkBoundaryMessageId = forkedTranscript.at(-1)?.view.id;
    if (!forkBoundaryMessageId) {
      throw new Error('Fork transcript is missing its settled boundary message.');
    }
    const forkedSession = {
      ...session,
      forkBoundaryMessageId,
      activeNodeId: forkBoundaryMessageId,
      updatedAt: nowIso(),
    };

    this.sessions.set(session.id, forkedSession);
    this.messages.set(session.id, forkedTranscript);
    return {
      session: cloneJson(forkedSession),
      status: 'forked',
      messageCopies: copied.map(({ view }, index) => ({
        source: { id: view.id, turnId: view.turnId },
        target: {
          id: forkedTranscript[index].view.id,
          turnId: forkedTranscript[index].view.turnId,
        },
      })),
    };
  }

  async deleteTurn(input: DeleteTurnInput): Promise<DeleteTurnResult> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      return { status: 'session-not-found' };
    }

    const transcript = this.messages.get(input.sessionId) ?? [];
    const firstIndex = transcript.findIndex((stored) => stored.view.turnId === input.turnId);
    if (firstIndex < 0) {
      return { status: 'turn-not-found' };
    }
    const deleted = transcript.filter((stored) => stored.view.turnId === input.turnId);
    if (deleted.some((stored) => UNSETTLED_MESSAGE_STATUSES.has(stored.view.status))) {
      return { status: 'turn-unsettled' };
    }

    // Synchronous section: the checkpoint reset and the removal commit
    // together or not at all.
    // A summary covers everything up to its anchor turn, so only a checkpoint
    // anchored strictly before the deleted turn can be replayed afterwards.
    for (const stored of transcript) {
      if (stored.contextCheckpoint === null) {
        continue;
      }
      const anchorTurnId = readCheckpointAnchorTurnId(stored.contextCheckpoint);
      const anchorIndex =
        anchorTurnId === null
          ? -1
          : transcript.findIndex((entry) => entry.view.turnId === anchorTurnId);
      if (anchorIndex < 0 || anchorIndex >= firstIndex) {
        stored.contextCheckpoint = null;
      }
    }

    const deletedMessageIds = deleted.map((stored) => stored.view.id);
    this.runtimeRevisions.set(
      input.sessionId,
      (this.runtimeRevisions.get(input.sessionId) ?? 0) + 1,
    );
    this.removeTurn(input.sessionId, input.turnId);
    const current = this.sessions.get(input.sessionId)!;
    if (
      current.forkBoundaryMessageId !== null &&
      deletedMessageIds.includes(current.forkBoundaryMessageId)
    ) {
      this.sessions.set(input.sessionId, {
        ...current,
        forkBoundaryMessageId: null,
        updatedAt: nowIso(),
      });
    }
    return { deletedMessageIds, status: 'deleted' };
  }

  /** Removes the turn after moving the questions below its answers to the turn's parent. */
  private removeTurn(sessionId: string, turnId: string) {
    const transcript = this.messages.get(sessionId) ?? [];
    const removed = transcript.filter((stored) => stored.view.turnId === turnId);
    const ids = new Set(removed.map((stored) => stored.view.id));
    const question = removed.find((stored) => stored.view.role === 'user') ?? removed[0];
    const parentId = question?.view.parentId ?? null;
    const remaining = transcript.filter((stored) => !ids.has(stored.view.id));
    for (const stored of remaining)
      if (stored.view.parentId && ids.has(stored.view.parentId))
        stored.view = { ...stored.view, parentId };
    this.messages.set(sessionId, remaining);
    const session = this.sessions.get(sessionId);
    if (session?.activeNodeId && ids.has(session.activeNodeId))
      this.sessions.set(sessionId, {
        ...session,
        activeNodeId: newestLeaf(remaining, parentId),
      });
  }

  async reserveInitialSubmission(
    input: ReserveInitialSubmissionInput,
  ): Promise<ReserveInitialSubmissionResult> {
    if (this.sessions.has(input.sessionId)) {
      throw new Error(`Session already exists: ${input.sessionId}`);
    }
    this.assertNewMessageIds(input);
    const session = createSessionView({
      id: input.sessionId,
      agentId: input.agentId,
      ...(input.workspaceFolderId ? { workspaceFolderId: input.workspaceFolderId } : {}),
    });
    const transcript: StoredMessage[] = [];
    const reserved = reserveInTranscript(transcript, {
      ...input,
      sessionId: session.id,
      parentMessageId: null,
    });
    const activeSession = {
      ...session,
      activeNodeId: reserved.assistantMessage.id,
      updatedAt: reserved.assistantMessage.createdAt,
    };
    this.sessions.set(session.id, activeSession);
    this.messages.set(session.id, transcript);
    return cloneJson({ ...reserved, session: activeSession });
  }

  async discardQueuedTurn(input: DeleteTurnInput): Promise<string[]> {
    const rows = this.messages.get(input.sessionId) ?? [];
    const selected = rows.filter((row) => row.view.turnId === input.turnId);
    if (!selected.some((row) => row.view.role === 'assistant' && row.view.status === 'pending'))
      return [];
    this.removeTurn(input.sessionId, input.turnId);
    return selected.map((row) => row.view.id);
  }

  async reserveSubmission(input: ReserveSubmissionInput): Promise<ReserveSubmissionResult> {
    const transcript = this.messages.get(input.sessionId);
    if (!transcript) {
      throw new Error(`Cannot reserve a submission for an unknown session: ${input.sessionId}`);
    }
    this.assertNewMessageIds(input);
    const session = this.sessions.get(input.sessionId);
    const parentMessageId =
      input.parentMessageId === undefined ? (session?.activeNodeId ?? null) : input.parentMessageId;
    if (parentMessageId !== null && !transcript.some(({ view }) => view.id === parentMessageId))
      throw new Error('The submission continues from a message that no longer exists.');
    const reserved = reserveInTranscript(transcript, { ...input, parentMessageId });
    if (session) {
      this.sessions.set(input.sessionId, {
        ...session,
        activeNodeId: reserved.assistantMessage.id,
        updatedAt: reserved.assistantMessage.createdAt,
      });
    }
    return cloneJson(reserved);
  }

  async reserveAnswer(input: ReserveAnswerInput): Promise<ReserveSubmissionResult> {
    const transcript = this.messages.get(input.sessionId) ?? [];
    const user = transcript.find(({ view }) => view.id === input.userMessageId);
    if (!user || user.view.role !== 'user' || !user.view.turnId)
      throw new Error('The question to answer no longer exists.');
    if (
      [...this.messages.values()].some((rows) =>
        rows.some(({ view }) => view.id === input.assistantMessageId),
      )
    )
      throw new Error('Submission message IDs must be new and distinct.');
    const timestamp = nowIso();
    const assistantMessage: AgentMessageView = {
      id: input.assistantMessageId,
      sessionId: input.sessionId,
      parentId: user.view.id,
      siblingsGroupId: 0,
      turnId: user.view.turnId,
      role: 'assistant',
      status: 'pending',
      parts: [],
      stats: null,
      modelId: input.modelId,
      inferenceSnapshot: { status: 'supported', snapshot: cloneJson(input.inferenceSnapshot) },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    transcript.push({ view: assistantMessage, error: null, contextCheckpoint: null });
    const session = this.sessions.get(input.sessionId)!;
    this.sessions.set(input.sessionId, {
      ...session,
      activeNodeId: assistantMessage.id,
      updatedAt: timestamp,
    });
    return cloneJson({
      turnId: user.view.turnId,
      userMessage: user.view,
      assistantMessage,
      additionalAssistantMessages: [],
    });
  }

  async selectMessage(sessionId: string, messageId: string): Promise<AgentSessionView | null> {
    const session = this.sessions.get(sessionId);
    const transcript = this.messages.get(sessionId) ?? [];
    if (!session || !transcript.some(({ view }) => view.id === messageId)) return null;
    // Already on the selected branch: keep the current leaf instead of jumping below it.
    if (pathOf(transcript, session).some(({ view }) => view.id === messageId))
      return cloneJson(session);
    const selected = { ...session, activeNodeId: newestLeaf(transcript, messageId) };
    this.sessions.set(sessionId, selected);
    return cloneJson(selected);
  }

  async reserveRetry(input: ReserveRetryInput): Promise<ReserveSubmissionResult> {
    const source = this.messages.get(input.sessionId) ?? [];
    const assistant = source.find(({ view }) => view.id === input.assistantMessageId);
    const user = source.find(({ view }) => view.id === assistant?.view.parentId);
    if (
      !assistant ||
      assistant.view.role !== 'assistant' ||
      UNSETTLED_MESSAGE_STATUSES.has(assistant.view.status) ||
      source.some(({ view }) => view.parentId === assistant.view.id) ||
      !user ||
      user.view.id !== input.userMessageId ||
      user.view.role !== 'user' ||
      !assistant.view.turnId ||
      user.view.turnId !== assistant.view.turnId
    ) {
      throw new Error('The retry source is not a settled leaf answer of this session.');
    }
    const previousTurnId = assistant.view.turnId;
    const session = this.sessions.get(input.sessionId)!;
    this.runtimeRevisions.set(
      input.sessionId,
      (this.runtimeRevisions.get(input.sessionId) ?? 0) + 1,
    );
    const turnId = uuidv7();
    const updatedAt = nowIso();
    user.view = { ...user.view, turnId, parts: cloneJson(input.userParts), updatedAt };
    assistant.view = {
      ...assistant.view,
      turnId,
      status: 'pending',
      updatedAt,
      // Reissued so the replacement execution's own part ids cannot collide
      // with a retained one carried over from the previous attempt.
      parts: cloneJson(input.assistantParts).map((part, index) => ({
        ...part,
        id: `retained-${turnId}-${index}`,
      })),
      modelId: input.modelId,
      inferenceSnapshot: { status: 'supported', snapshot: cloneJson(input.inferenceSnapshot) },
      stats: assistant.view.stats
        ? { ...assistant.view.stats, runtimeTiming: undefined, contextTokens: undefined }
        : null,
    };
    assistant.error = null;
    assistant.contextCheckpoint = null;
    for (const stored of source)
      if (stored.view.turnId === previousTurnId) stored.view = { ...stored.view, turnId };
    this.sessions.set(session.id, { ...session, activeNodeId: assistant.view.id, updatedAt });
    return cloneJson({
      turnId,
      userMessage: user.view,
      assistantMessage: assistant.view,
      additionalAssistantMessages: [],
    });
  }

  async listMessages(sessionId: string, through?: string | null): Promise<AgentMessageView[]> {
    return cloneJson(this.path(sessionId, through).map((stored) => stored.view));
  }

  async getMessage(sessionId: string, messageId: string): Promise<AgentMessageView | null> {
    const stored = (this.messages.get(sessionId) ?? []).find(({ view }) => view.id === messageId);
    return stored ? cloneJson(stored.view) : null;
  }

  async hasChildren(sessionId: string, messageId: string): Promise<boolean> {
    return (this.messages.get(sessionId) ?? []).some(({ view }) => view.parentId === messageId);
  }

  private path(sessionId: string, through?: string | null) {
    return pathOf(this.messages.get(sessionId) ?? [], this.sessions.get(sessionId), through);
  }

  private assertNewMessageIds(
    input: Pick<
      ReserveSubmissionInput,
      'userMessageId' | 'assistantMessageId' | 'additionalReplies'
    >,
  ): void {
    const answers = [input, ...(input.additionalReplies ?? [])];
    const ids = new Set([
      input.userMessageId,
      ...answers.map((answer) => answer.assistantMessageId),
    ]);
    if (
      ids.size !== answers.length + 1 ||
      [...this.messages.values()].some((messages) => messages.some(({ view }) => ids.has(view.id)))
    ) {
      throw new Error('Submission message IDs must be new and distinct.');
    }
  }

  async loadRuntimeTurnContext(
    sessionId: string,
    afterTurnId: string | null,
    through?: string | null,
  ) {
    const transcript = this.path(sessionId, through);
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

    return cloneJson({
      anchorFound,
      hasMessages: transcript.length > 0,
      history,
      referencedFileEntryIds,
    });
  }

  async loadSkillActivations(sessionId: string, through?: string | null) {
    return cloneJson(
      collectSkillActivations(this.path(sessionId, through).map(({ view }) => view)),
    );
  }

  async loadWorkflowLoads(sessionId: string, through?: string | null) {
    return this.path(sessionId, through).flatMap(({ view }) =>
      view.role === 'assistant'
        ? view.parts.flatMap((part) => {
            if (
              part.type !== 'dynamic-tool' ||
              part.state !== 'output-available' ||
              part.toolRef.source !== 'builtin' ||
              part.toolRef.capabilityId !== 'load_workflow'
            )
              return [];
            const value = (part.output as { value?: unknown } | undefined)?.value;
            return value &&
              typeof value === 'object' &&
              'status' in value &&
              value.status === 'ok' &&
              'workflow_id' in value &&
              typeof value.workflow_id === 'string'
              ? [value.workflow_id]
              : [];
          })
        : [],
    );
  }

  async getLatestContextCheckpoint(
    sessionId: string,
    excludeAssistantMessageId?: string,
    through?: string | null,
  ) {
    const transcript = this.path(sessionId, through);
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const stored = transcript[index];
      if (stored?.view.id === excludeAssistantMessageId) continue;
      if (stored?.view.role === 'assistant' && stored.contextCheckpoint !== null) {
        return cloneJson({
          assistantMessageId: stored.view.id,
          checkpoint: stored.contextCheckpoint,
        });
      }
    }
    return null;
  }

  async saveContextCheckpoint(
    assistantMessageId: string,
    turnId: string,
    checkpoint: RuntimeContextCheckpoint,
  ) {
    for (const transcript of this.messages.values()) {
      const stored = transcript.find(
        ({ view }) =>
          view.id === assistantMessageId && view.turnId === turnId && view.status === 'success',
      );
      if (stored) {
        stored.contextCheckpoint = cloneJson(checkpoint);
        return;
      }
    }
  }

  async finalizeAssistantMessage(input: FinalizeAssistantMessageInput): Promise<AgentMessageView> {
    for (const [sessionId, transcript] of this.messages) {
      const stored = transcript.find((entry) => entry.view.id === input.assistantMessageId);
      if (!stored) {
        continue;
      }
      // Synchronous section: message terminal state settles atomically
      // (invariant 5).
      if (input.turnId !== undefined && stored.view.turnId !== input.turnId)
        throw new Error('Cannot finalize a replaced execution.');
      const updatedAt = nowIso();
      stored.view = {
        ...stored.view,
        status: input.status,
        parts: cloneJson(input.parts),
        stats: cloneJson(finalizeMessageStats(stored.view.stats, input)),
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
}
