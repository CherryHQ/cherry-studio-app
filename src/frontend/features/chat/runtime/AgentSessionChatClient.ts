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
  AgentTurnView,
} from '@/shared/contracts/agent';

export type AgentSessionChatStatus = 'idle' | 'observing' | 'ready' | 'error';

export type AgentSessionChatState = {
  activeTurn: AgentTurnView | null;
  enteringUserMessageId?: string;
  error?: Error;
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
  observation?: AgentSessionObservation;
  observationPromise?: Promise<void>;
  state: AgentSessionChatState;
};

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
        isSnapshotInstalled = true;
        for (const event of queuedEvents) {
          this.applyEvent(entry, event);
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

  createSession(agentId: string): Promise<AgentSessionView> {
    return this.protocol.createSession({ agentId, executionTarget: { kind: 'local' } });
  }

  async submitMessage(sessionId: string, parts: AgentInputPart[]) {
    await this.observe(sessionId);
    return this.protocol.submitMessage({ parts, sessionId });
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
      state: createSessionState(sessionId),
    };
    this.sessions.set(sessionId, entry);
    return entry;
  }

  private stopObservation(entry: SessionEntry): void {
    entry.generation += 1;
    entry.observation?.unsubscribe();
    entry.observation = undefined;
    entry.observationPromise = undefined;
  }

  private installSnapshot(entry: SessionEntry, snapshot: AgentSessionSnapshot): void {
    entry.liveMessages.clear();
    if (snapshot.streamingMessage) {
      entry.liveMessages.set(snapshot.streamingMessage.id, snapshot.streamingMessage);
    }
    this.updateState(entry, {
      activeTurn: snapshot.activeTurn,
      liveMessages: [...entry.liveMessages.values()],
      pendingApprovals: snapshot.pendingApprovals,
      sessionId: snapshot.session.id,
      snapshot,
      status: 'ready',
    });
  }

  private applyEvent(entry: SessionEntry, event: AgentEvent): void {
    switch (event.type) {
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
        this.updateState(entry, {
          ...entry.state,
          ...(event.message.role === 'user' ? { enteringUserMessageId: event.message.id } : {}),
          liveMessages: [...entry.liveMessages.values()],
        });
        this.options.onTranscriptChanged?.(entry.state.sessionId);
        return;
      case 'message.delta': {
        const message = entry.liveMessages.get(event.messageId);
        if (!message) {
          return;
        }
        const nextMessage = applyMessageDelta(message, event.delta);
        if (nextMessage === message) {
          return;
        }
        entry.liveMessages.set(event.messageId, nextMessage);
        this.updateState(entry, {
          ...entry.state,
          liveMessages: [...entry.liveMessages.values()],
        });
        return;
      }
      case 'message.finalized':
        entry.liveMessages.set(event.message.id, event.message);
        this.updateState(entry, {
          ...entry.state,
          liveMessages: [...entry.liveMessages.values()],
        });
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

  private updateState(entry: SessionEntry, state: AgentSessionChatState): void {
    entry.state = state;
    for (const listener of entry.listeners) {
      listener();
    }
  }
}

export const __testing = { applyMessageDelta };
