import { v7 as uuidv7 } from 'uuid';

import {
  AppStatePolicy,
  BaseService,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type {
  AgentApprovalView,
  AgentErrorView,
  AgentMessagePart,
  AgentMessageView,
  AgentSessionView,
  AgentTurnView,
} from '@/shared/contracts/agent';

import type { AgentSessionStore, FinalizeTurnInput, ReserveTurnResult } from './AgentSessionStore';

const NON_TERMINAL_TURN_STATUSES = new Set<AgentTurnView['status']>([
  'running',
  'awaiting-approval',
  'cancelling',
]);
const UNSETTLED_MESSAGE_STATUSES = new Set<AgentMessageView['status']>(['pending', 'streaming']);

function nowIso(): string {
  return new Date().toISOString();
}

/** Values cross the store boundary by copy, matching row-mapping semantics. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Process-local reference adapter for {@link AgentSessionStore}.
 *
 * Its state belongs to one `ApplicationHost` generation and is not durable
 * across app restarts. It remains useful as the Host's architecture-test
 * adapter after durable Mobile Agent persistence lands. Production composition
 * selects it only while that persistence design is pending under
 * https://github.com/CherryHQ/cherry-studio-app/issues/568.
 *
 * @experimental Do not infer restart recovery from this adapter.
 */
@Injectable('AgentSessionStore')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('not-applicable')
export class InMemoryAgentSessionStore extends BaseService implements AgentSessionStore {
  private readonly sessions = new Map<string, AgentSessionView>();
  private readonly turns = new Map<string, AgentTurnView>();
  /** Insertion-ordered per Session, which is the transcript order. */
  private readonly messages = new Map<string, AgentMessageView[]>();
  private readonly approvals = new Map<string, AgentApprovalView>();

  protected override onDestroy(): void {
    this.sessions.clear();
    this.turns.clear();
    this.messages.clear();
    this.approvals.clear();
  }

  async createSession(input: { agentId: string; title?: string }): Promise<AgentSessionView> {
    const timestamp = nowIso();
    const session: AgentSessionView = {
      id: uuidv7(),
      agentId: input.agentId,
      executionTarget: { kind: 'local' },
      title: input.title ?? '',
      titleIsManual: input.title !== undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
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

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.sessions.delete(sessionId)) {
      return false;
    }
    this.messages.delete(sessionId);
    for (const [turnId, turn] of this.turns) {
      if (turn.sessionId === sessionId) {
        this.turns.delete(turnId);
      }
    }
    for (const [approvalId, approval] of this.approvals) {
      if (approval.sessionId === sessionId) {
        this.approvals.delete(approvalId);
      }
    }
    return true;
  }

  async reserveTurn(input: {
    sessionId: string;
    userParts: AgentMessagePart[];
  }): Promise<ReserveTurnResult> {
    // Synchronous section: the three writes commit together or not at all.
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
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const turn: AgentTurnView = {
      id: turnId,
      sessionId: input.sessionId,
      status: 'running',
      assistantMessageId: assistantMessage.id,
      error: null,
      startedAt: timestamp,
      endedAt: null,
    };
    const transcript = this.messages.get(input.sessionId);
    if (!transcript) {
      throw new Error(`Cannot reserve a turn for an unknown session: ${input.sessionId}`);
    }
    transcript.push(userMessage, assistantMessage);
    this.turns.set(turnId, turn);
    return cloneJson({ turn, userMessage, assistantMessage });
  }

  async getTurn(turnId: string): Promise<AgentTurnView | null> {
    const turn = this.turns.get(turnId);
    return turn ? cloneJson(turn) : null;
  }

  async listMessages(sessionId: string): Promise<AgentMessageView[]> {
    return cloneJson(this.messages.get(sessionId) ?? []);
  }

  async setTurnStatus(
    turnId: string,
    status: 'running' | 'awaiting-approval' | 'cancelling',
  ): Promise<AgentTurnView | null> {
    const turn = this.turns.get(turnId);
    if (!turn) {
      return null;
    }
    const updated: AgentTurnView = { ...turn, status };
    this.turns.set(turnId, updated);
    return cloneJson(updated);
  }

  async finalizeTurn(input: FinalizeTurnInput): Promise<{
    turn: AgentTurnView;
    assistantMessage: AgentMessageView;
  }> {
    const turn = this.turns.get(input.turnId);
    if (!turn) {
      throw new Error(`Cannot finalize an unknown turn: ${input.turnId}`);
    }
    const transcript = this.messages.get(turn.sessionId) ?? [];
    const messageIndex = transcript.findIndex((message) => message.id === input.assistantMessageId);
    if (messageIndex < 0) {
      throw new Error(`Cannot finalize an unknown message: ${input.assistantMessageId}`);
    }
    // Synchronous section: message and turn settle together (invariant 5).
    const assistantMessage: AgentMessageView = {
      ...transcript[messageIndex],
      status: input.messageStatus,
      parts: cloneJson(input.parts),
      usage: input.usage === null ? null : cloneJson(input.usage),
      updatedAt: nowIso(),
    };
    const finalTurn: AgentTurnView = {
      ...turn,
      status: input.turnStatus,
      error: input.turnError === null ? null : cloneJson(input.turnError),
      endedAt: nowIso(),
    };
    transcript[messageIndex] = assistantMessage;
    this.turns.set(finalTurn.id, finalTurn);
    return cloneJson({ turn: finalTurn, assistantMessage });
  }

  async upsertApproval(approval: AgentApprovalView): Promise<void> {
    this.approvals.set(approval.id, cloneJson(approval));
  }

  async reconcileInterrupted(error: AgentErrorView): Promise<number> {
    let count = 0;
    for (const [turnId, turn] of this.turns) {
      if (NON_TERMINAL_TURN_STATUSES.has(turn.status)) {
        this.turns.set(turnId, {
          ...turn,
          status: 'interrupted',
          error: cloneJson(error),
          endedAt: nowIso(),
        });
        count += 1;
      }
    }
    for (const transcript of this.messages.values()) {
      for (const [index, message] of transcript.entries()) {
        if (UNSETTLED_MESSAGE_STATUSES.has(message.status)) {
          transcript[index] = { ...message, status: 'interrupted', updatedAt: nowIso() };
        }
      }
    }
    return count;
  }
}
