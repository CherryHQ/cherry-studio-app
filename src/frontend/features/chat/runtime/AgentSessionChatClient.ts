import type {
  AgentApprovalView,
  AgentEvent,
  AgentInputPart,
  AgentMessageDelta,
  AgentMessageView,
  AgentProtocol,
  AgentSessionObservation,
  AgentSessionSnapshot,
  AgentSessionView,
  AgentStartSessionInput,
  AgentSubmitMessageInput,
  AgentTurnView,
} from '@/shared/contracts/agent';

export type AgentSessionChatStatus = 'idle' | 'observing' | 'ready' | 'error';

export type AgentSessionChatState = {
  activeTurn: AgentTurnView | null;
  enteringUserMessageId?: string;
  error?: Error;
  hasHistoryBeforeActiveTurn?: boolean;
  liveMessages: readonly AgentMessageView[];
  pendingApprovals: readonly AgentApprovalView[];
  sessionId: string;
  snapshot?: AgentSessionSnapshot;
  status: AgentSessionChatStatus;
};

type AgentSessionChatClientOptions = {
  onSessionChanged?: (sessionId: string) => void;
  onTranscriptChanged?: (sessionId: string) => void;
};

type SessionEntry = {
  generation: number;
  listeners: Set<() => void>;
  liveMessages: Map<string, AgentMessageView>;
  liveMessagesFlush?: ReturnType<typeof setTimeout>;
  observation?: AgentSessionObservation;
  observationPromise?: Promise<void>;
  pendingTextDeltas: Map<string, { chunks: string[]; messageId: string; partId: string }>;
  state: AgentSessionChatState;
};

const LIVE_MESSAGE_FLUSH_INTERVAL_MS = 16;

const TERMINAL_TURN_STATUSES = new Set<AgentTurnView['status']>([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
]);

function createSessionState(sessionId: string): AgentSessionChatState {
  return {
    activeTurn: null,
    liveMessages: [],
    pendingApprovals: [],
    sessionId,
    status: 'idle',
  };
}

function applyMessageDelta(message: AgentMessageView, delta: AgentMessageDelta): AgentMessageView {
  switch (delta.op) {
    case 'part.add': {
      const parts = [...message.parts];
      parts.splice(Math.min(delta.index, parts.length), 0, delta.part);
      return { ...message, parts };
    }
    case 'text.append': {
      let changed = false;
      const parts = message.parts.map((part) => {
        if (part.id !== delta.partId || (part.type !== 'text' && part.type !== 'reasoning')) {
          return part;
        }

        changed = true;
        return { ...part, text: `${part.text}${delta.text}` };
      });
      return changed ? { ...message, parts } : message;
    }
    case 'part.replace': {
      let changed = false;
      const parts = message.parts.map((part) => {
        if (part.id !== delta.part.id) {
          return part;
        }

        changed = true;
        return delta.part;
      });
      return changed ? { ...message, parts } : message;
    }
  }
}

function isTerminalMessage(message: AgentMessageView): boolean {
  return message.status !== 'pending' && message.status !== 'streaming';
}

export class AgentSessionChatClient {
  private readonly sessions = new Map<string, SessionEntry>();

  constructor(
    private readonly protocol: AgentProtocol,
    private readonly options: AgentSessionChatClientOptions = {},
  ) {}

  getState(sessionId: string): AgentSessionChatState {
    return this.getEntry(sessionId).state;
  }

  subscribe(sessionId: string, listener: () => void): () => void {
    const entry = this.getEntry(sessionId);
    entry.listeners.add(listener);
    void this.observe(sessionId).catch(() => undefined);

    return () => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0) {
        this.stopObservation(entry);
        if (this.sessions.get(sessionId) === entry) {
          this.sessions.delete(sessionId);
        }
      }
    };
  }

  async observe(sessionId: string, force = false): Promise<void> {
    const entry = this.getEntry(sessionId);
    if (entry.observationPromise) {
      return entry.observationPromise;
    }
    if (entry.observation && !force) {
      return;
    }

    this.stopObservation(entry);
    const generation = entry.generation;
    this.updateState(entry, {
      ...entry.state,
      error: undefined,
      status: 'observing',
    });

    const queuedEvents: AgentEvent[] = [];
    let isSnapshotInstalled = false;
    const observationPromise = this.protocol
      .observeSession(sessionId, (event) => {
        if (entry.generation !== generation) {
          return;
        }
        if (!isSnapshotInstalled) {
          queuedEvents.push(event);
          return;
        }
        this.applyEvent(entry, event);
      })
      .then((observation) => {
        if (entry.generation !== generation) {
          observation.unsubscribe();
          return;
        }

        entry.observation = observation;
        this.installSnapshot(entry, observation.snapshot);
        // A fresh Host snapshot can reflect terminal events missed while this
        // session had no observers. Refresh the durable transcript projection.
        this.options.onTranscriptChanged?.(sessionId);
        isSnapshotInstalled = true;
        for (const event of queuedEvents) {
          this.applyEvent(entry, event);
        }
        if (entry.liveMessagesFlush !== undefined) {
          this.commitLiveMessages(entry);
        }
      })
      .catch((error: unknown) => {
        if (entry.generation !== generation) {
          return;
        }

        const observationError = error instanceof Error ? error : new Error(String(error));
        this.updateState(entry, {
          ...createSessionState(sessionId),
          error: observationError,
          status: 'error',
        });
        throw observationError;
      })
      .finally(() => {
        if (entry.observationPromise === observationPromise) {
          entry.observationPromise = undefined;
        }
      });
    entry.observationPromise = observationPromise;
    return observationPromise;
  }

  async refresh(sessionId: string): Promise<void> {
    await this.observe(sessionId, true);
  }

  async refreshObservedSessions(): Promise<void> {
    await Promise.allSettled(
      [...this.sessions.entries()]
        .filter(([, entry]) => entry.listeners.size > 0)
        .map(([sessionId]) => this.refresh(sessionId)),
    );
  }

  async startSession(
    agentId: string,
    parts: AgentInputPart[],
    overrides: Pick<AgentStartSessionInput, 'modelId' | 'reasoningEffort'> = {},
  ): Promise<AgentSessionView> {
    const session = await this.protocol.startSession({
      agentId,
      executionTarget: { kind: 'local' },
      parts,
      ...overrides,
    });
    // The destination route observes after navigation. Its atomic Host snapshot
    // reconstructs any live turn state without leaving an ownerless listener here.
    return session;
  }

  async forkSession(
    sessionId: string,
    fromMessageId: string,
    title?: string,
  ): Promise<AgentSessionView> {
    const session = await this.protocol.forkSession({
      fromMessageId,
      sessionId,
      ...(title ? { title } : {}),
    });
    // As with a new Session, the destination route owns observation.
    return session;
  }

  async submitMessage(
    sessionId: string,
    parts: AgentInputPart[],
    overrides: Pick<AgentSubmitMessageInput, 'modelId' | 'reasoningEffort'> = {},
  ) {
    const entry = this.getEntry(sessionId);
    await this.observe(sessionId);
    try {
      return await this.protocol.submitMessage({ parts, sessionId, ...overrides });
    } finally {
      // Non-React callers may submit without ever installing a subscriber. The
      // Host snapshot makes a later observation lossless, so do not retain an
      // ownerless listener or SessionEntry after admission completes.
      if (entry.listeners.size === 0 && this.sessions.get(sessionId) === entry) {
        this.stopObservation(entry);
        this.sessions.delete(sessionId);
      }
    }
  }

  reconcilePersistedMessages(
    sessionId: string,
    persistedMessages: readonly AgentMessageView[],
  ): void {
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.liveMessages.size === 0 || persistedMessages.length === 0) {
      return;
    }

    const persistedById = new Map(persistedMessages.map((message) => [message.id, message]));
    let changed = false;
    for (const [messageId, liveMessage] of entry.liveMessages) {
      const persistedMessage = persistedById.get(messageId);
      if (
        persistedMessage &&
        isTerminalMessage(liveMessage) &&
        isTerminalMessage(persistedMessage) &&
        persistedMessage.status === liveMessage.status &&
        persistedMessage.updatedAt === liveMessage.updatedAt
      ) {
        entry.liveMessages.delete(messageId);
        changed = true;
      }
    }

    if (changed) {
      this.commitLiveMessages(entry);
    }
  }

  async cancelTurn(sessionId: string): Promise<void> {
    const turn = this.getEntry(sessionId).state.activeTurn;
    if (!turn || TERMINAL_TURN_STATUSES.has(turn.status)) {
      return;
    }

    await this.protocol.cancelTurn({ sessionId, turnId: turn.id });
  }

  async respondApproval(
    sessionId: string,
    approvalId: string,
    decision: 'approve' | 'deny',
  ): Promise<void> {
    const approval = this.getEntry(sessionId).state.pendingApprovals.find(
      (candidate) => candidate.id === approvalId,
    );
    if (!approval) {
      return;
    }

    await this.protocol.respondApproval({
      approvalId,
      decision,
      sessionId,
      turnId: approval.turnId,
    });
  }

  dispose(): void {
    for (const entry of this.sessions.values()) {
      this.stopObservation(entry);
      entry.listeners.clear();
    }
    this.sessions.clear();
  }

  private getEntry(sessionId: string): SessionEntry {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const entry: SessionEntry = {
      generation: 0,
      listeners: new Set(),
      liveMessages: new Map(),
      pendingTextDeltas: new Map(),
      state: createSessionState(sessionId),
    };
    this.sessions.set(sessionId, entry);
    return entry;
  }

  private stopObservation(entry: SessionEntry): void {
    entry.generation += 1;
    this.cancelLiveMessagesFlush(entry);
    entry.pendingTextDeltas.clear();
    entry.observation?.unsubscribe();
    entry.observation = undefined;
    entry.observationPromise = undefined;
  }

  private installSnapshot(entry: SessionEntry, snapshot: AgentSessionSnapshot): void {
    entry.liveMessages.clear();
    if (snapshot.activeUserMessage) {
      entry.liveMessages.set(snapshot.activeUserMessage.id, snapshot.activeUserMessage);
    }
    if (snapshot.streamingMessage) {
      entry.liveMessages.set(snapshot.streamingMessage.id, snapshot.streamingMessage);
    }
    this.updateState(entry, {
      activeTurn: snapshot.activeTurn,
      ...(snapshot.activeUserMessage
        ? { enteringUserMessageId: snapshot.activeUserMessage.id }
        : {}),
      hasHistoryBeforeActiveTurn: snapshot.hasHistoryBeforeActiveTurn ?? undefined,
      liveMessages: [...entry.liveMessages.values()],
      pendingApprovals: snapshot.pendingApprovals,
      sessionId: snapshot.session.id,
      snapshot,
      status: 'ready',
    });
  }

  private applyEvent(entry: SessionEntry, event: AgentEvent): void {
    switch (event.type) {
      case 'session.updated':
        this.updateState(entry, {
          ...entry.state,
          ...(entry.state.snapshot
            ? {
                snapshot: {
                  ...entry.state.snapshot,
                  session: event.session,
                },
              }
            : {}),
        });
        this.options.onSessionChanged?.(event.session.id);
        return;
      case 'turn.updated':
        this.updateState(entry, {
          ...entry.state,
          activeTurn: event.turn,
          pendingApprovals: TERMINAL_TURN_STATUSES.has(event.turn.status)
            ? []
            : entry.state.pendingApprovals,
        });
        if (TERMINAL_TURN_STATUSES.has(event.turn.status)) {
          this.options.onSessionChanged?.(entry.state.sessionId);
        }
        return;
      case 'message.created':
        entry.liveMessages.set(event.message.id, event.message);
        this.commitLiveMessages(entry, {
          ...(event.message.role === 'user' ? { enteringUserMessageId: event.message.id } : {}),
        });
        if (event.message.role === 'user') {
          this.options.onSessionChanged?.(entry.state.sessionId);
        }
        this.options.onTranscriptChanged?.(entry.state.sessionId);
        return;
      case 'message.delta': {
        if (event.delta.op === 'text.append') {
          if (!this.queueTextDelta(entry, event.messageId, event.delta)) {
            return;
          }
          this.scheduleLiveMessagesFlush(entry);
          return;
        }

        this.applyPendingTextDeltas(entry);
        const message = entry.liveMessages.get(event.messageId);
        if (!message) {
          return;
        }
        const nextMessage = applyMessageDelta(message, event.delta);
        if (nextMessage === message) {
          return;
        }
        entry.liveMessages.set(event.messageId, nextMessage);
        this.commitLiveMessages(entry);
        return;
      }
      case 'message.finalized':
        entry.pendingTextDeltas.clear();
        entry.liveMessages.set(event.message.id, event.message);
        this.commitLiveMessages(entry);
        this.options.onTranscriptChanged?.(entry.state.sessionId);
        return;
      case 'approval.requested':
        this.updateState(entry, {
          ...entry.state,
          pendingApprovals: [
            ...entry.state.pendingApprovals.filter((approval) => approval.id !== event.approval.id),
            event.approval,
          ],
        });
        return;
      case 'approval.resolved':
        this.updateState(entry, {
          ...entry.state,
          pendingApprovals: entry.state.pendingApprovals.filter(
            (approval) => approval.id !== event.approval.id,
          ),
        });
    }
  }

  private cancelLiveMessagesFlush(entry: SessionEntry): void {
    if (entry.liveMessagesFlush === undefined) {
      return;
    }
    clearTimeout(entry.liveMessagesFlush);
    entry.liveMessagesFlush = undefined;
  }

  private commitLiveMessages(
    entry: SessionEntry,
    statePatch: Partial<AgentSessionChatState> = {},
  ): void {
    this.applyPendingTextDeltas(entry);
    this.cancelLiveMessagesFlush(entry);
    this.updateState(entry, {
      ...entry.state,
      ...statePatch,
      liveMessages: [...entry.liveMessages.values()],
    });
  }

  private scheduleLiveMessagesFlush(entry: SessionEntry): void {
    if (entry.liveMessagesFlush !== undefined) {
      return;
    }
    entry.liveMessagesFlush = setTimeout(() => {
      entry.liveMessagesFlush = undefined;
      this.commitLiveMessages(entry);
    }, LIVE_MESSAGE_FLUSH_INTERVAL_MS);
  }

  private queueTextDelta(
    entry: SessionEntry,
    messageId: string,
    delta: Extract<AgentMessageDelta, { op: 'text.append' }>,
  ): boolean {
    if (delta.text.length === 0) return false;

    const message = entry.liveMessages.get(messageId);
    const target = message?.parts.find(
      (part) => part.id === delta.partId && (part.type === 'text' || part.type === 'reasoning'),
    );
    if (!target) return false;

    const key = `${messageId}\u0000${delta.partId}`;
    const pending = entry.pendingTextDeltas.get(key);
    if (pending) {
      pending.chunks.push(delta.text);
    } else {
      entry.pendingTextDeltas.set(key, {
        chunks: [delta.text],
        messageId,
        partId: delta.partId,
      });
    }
    return true;
  }

  private applyPendingTextDeltas(entry: SessionEntry): void {
    if (entry.pendingTextDeltas.size === 0) return;

    for (const { chunks, messageId, partId } of entry.pendingTextDeltas.values()) {
      const message = entry.liveMessages.get(messageId);
      if (!message) continue;
      const nextMessage = applyMessageDelta(message, {
        op: 'text.append',
        partId,
        text: chunks.join(''),
      });
      if (nextMessage !== message) {
        entry.liveMessages.set(messageId, nextMessage);
      }
    }
    entry.pendingTextDeltas.clear();
  }

  private updateState(entry: SessionEntry, state: AgentSessionChatState): void {
    entry.state = state;
    for (const listener of entry.listeners) {
      listener();
    }
  }
}

export const __testing = { applyMessageDelta };
