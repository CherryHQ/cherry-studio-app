/**
 * Mobile Agent Session persistence: Sessions, turns, messages, and approvals
 * for the Mobile Agent Host (docs/references/agent/agent-protocol.md).
 *
 * This is a Host-private persistence service, not a Data API surface: rows are
 * mapped to protocol views here, absence is reported as `null`, and protocol
 * error semantics stay in the Host. Multi-row facts (turn reservation, terminal
 * commit, reconciliation) are single write transactions so the protocol
 * invariants "reserve before execution" and "terminal state commits before
 * terminal events publish" hold across process death.
 */

import { and, asc, eq, inArray } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import {
  mobileAgentApprovalTable,
  mobileAgentMessageTable,
  mobileAgentSessionTable,
  mobileAgentTurnTable,
  type MobileAgentMessageRow,
  type MobileAgentSessionRow,
  type MobileAgentTurnRow,
} from '@/backend/data/db/schemas';
import type {
  AgentApprovalView,
  AgentErrorView,
  AgentMessagePart,
  AgentMessageView,
  AgentSessionView,
  AgentTurnView,
  AgentUsageView,
} from '@/shared/contracts/agent';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { createOrderedUuid } from '../db/schemas/_columnHelpers';
import { timestampToISO } from './utils/rowMappers';

const logger = loggerService.withContext('MobileAgentSessionService');

const NON_TERMINAL_TURN_STATUSES = ['running', 'awaiting-approval', 'cancelling'] as const;
const UNSETTLED_MESSAGE_STATUSES = ['pending', 'streaming'] as const;

function rowToSessionView(row: MobileAgentSessionRow): AgentSessionView {
  return {
    id: row.id,
    agentId: row.agentId,
    executionTarget: { kind: 'local' },
    title: row.title,
    titleIsManual: row.titleIsManual,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  };
}

function rowToTurnView(row: MobileAgentTurnRow): AgentTurnView {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status,
    assistantMessageId: row.assistantMessageId,
    error: row.error ?? null,
    startedAt: timestampToISO(row.startedAt),
    endedAt: row.endedAt === null ? null : timestampToISO(row.endedAt),
  };
}

function rowToMessageView(row: MobileAgentMessageRow): AgentMessageView {
  return {
    id: row.id,
    sessionId: row.sessionId,
    turnId: row.turnId,
    role: row.role,
    status: row.status,
    parts: row.parts,
    usage: row.usage ?? null,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  };
}

export type ReserveTurnResult = {
  turn: AgentTurnView;
  userMessage: AgentMessageView;
  assistantMessage: AgentMessageView;
};

export type FinalizeTurnInput = {
  turnId: string;
  turnStatus: 'completed' | 'failed' | 'cancelled' | 'interrupted';
  turnError: AgentErrorView | null;
  assistantMessageId: string;
  messageStatus: 'success' | 'error' | 'cancelled' | 'interrupted';
  parts: AgentMessagePart[];
  usage: AgentUsageView | null;
};

export class MobileAgentSessionService {
  /**
   * Resolved per call rather than injected once, so the instance holds no
   * reference to a particular host generation.
   */
  private get dbService() {
    return application.get('DbService');
  }

  private get db() {
    return this.dbService.getDb();
  }

  async createSession(input: { agentId: string; title?: string }): Promise<AgentSessionView> {
    const [row] = await this.db
      .insert(mobileAgentSessionTable)
      .values({
        agentId: input.agentId,
        executionTargetKind: 'local',
        title: input.title ?? '',
        titleIsManual: input.title !== undefined,
      })
      .returning();
    return rowToSessionView(row);
  }

  async getSession(sessionId: string): Promise<AgentSessionView | null> {
    const [row] = await this.db
      .select()
      .from(mobileAgentSessionTable)
      .where(eq(mobileAgentSessionTable.id, sessionId))
      .limit(1);
    return row ? rowToSessionView(row) : null;
  }

  async renameSession(sessionId: string, title: string): Promise<AgentSessionView | null> {
    const [row] = await this.db
      .update(mobileAgentSessionTable)
      .set({ title, titleIsManual: true })
      .where(eq(mobileAgentSessionTable.id, sessionId))
      .returning();
    return row ? rowToSessionView(row) : null;
  }

  /** Cascades to turns, messages, and approvals. */
  async deleteSession(sessionId: string): Promise<boolean> {
    const [deleted] = await this.db
      .delete(mobileAgentSessionTable)
      .where(eq(mobileAgentSessionTable.id, sessionId))
      .returning({ id: mobileAgentSessionTable.id });
    return deleted !== undefined;
  }

  /**
   * Invariant 2: an admitted submission reserves the user message, the
   * assistant placeholder, and the turn in one transaction before execution.
   */
  async reserveTurn(input: {
    sessionId: string;
    userParts: AgentMessagePart[];
  }): Promise<ReserveTurnResult> {
    const turnId = createOrderedUuid();
    const userMessageId = createOrderedUuid();
    const assistantMessageId = createOrderedUuid();

    return this.dbService.withWriteTx(async (tx) => {
      const [userRow] = await tx
        .insert(mobileAgentMessageTable)
        .values({
          id: userMessageId,
          sessionId: input.sessionId,
          turnId,
          role: 'user',
          status: 'success',
          parts: input.userParts,
        })
        .returning();
      const [assistantRow] = await tx
        .insert(mobileAgentMessageTable)
        .values({
          id: assistantMessageId,
          sessionId: input.sessionId,
          turnId,
          role: 'assistant',
          status: 'pending',
          parts: [],
        })
        .returning();
      const [turnRow] = await tx
        .insert(mobileAgentTurnTable)
        .values({
          id: turnId,
          sessionId: input.sessionId,
          status: 'running',
          assistantMessageId,
          startedAt: Date.now(),
        })
        .returning();
      return {
        turn: rowToTurnView(turnRow),
        userMessage: rowToMessageView(userRow),
        assistantMessage: rowToMessageView(assistantRow),
      };
    });
  }

  async listMessages(sessionId: string): Promise<AgentMessageView[]> {
    const rows = await this.db
      .select()
      .from(mobileAgentMessageTable)
      .where(eq(mobileAgentMessageTable.sessionId, sessionId))
      .orderBy(asc(mobileAgentMessageTable.createdAt), asc(mobileAgentMessageTable.id));
    return rows.map(rowToMessageView);
  }

  /** Durable non-terminal turn transitions (awaiting-approval, cancelling, running). */
  async setTurnStatus(
    turnId: string,
    status: 'running' | 'awaiting-approval' | 'cancelling',
  ): Promise<AgentTurnView | null> {
    const [row] = await this.db
      .update(mobileAgentTurnTable)
      .set({ status })
      .where(eq(mobileAgentTurnTable.id, turnId))
      .returning();
    return row ? rowToTurnView(row) : null;
  }

  /**
   * Invariant 5: the terminal assistant message and turn state commit together,
   * before the Host publishes the terminal protocol events.
   */
  async finalizeTurn(input: FinalizeTurnInput): Promise<{
    turn: AgentTurnView;
    assistantMessage: AgentMessageView;
  }> {
    return this.dbService.withWriteTx(async (tx) => {
      const [messageRow] = await tx
        .update(mobileAgentMessageTable)
        .set({
          status: input.messageStatus,
          parts: input.parts,
          usage: input.usage,
        })
        .where(eq(mobileAgentMessageTable.id, input.assistantMessageId))
        .returning();
      const [turnRow] = await tx
        .update(mobileAgentTurnTable)
        .set({
          status: input.turnStatus,
          error: input.turnError,
          endedAt: Date.now(),
        })
        .where(eq(mobileAgentTurnTable.id, input.turnId))
        .returning();
      return {
        turn: rowToTurnView(turnRow),
        assistantMessage: rowToMessageView(messageRow),
      };
    });
  }

  async upsertApproval(approval: AgentApprovalView): Promise<void> {
    await this.db
      .insert(mobileAgentApprovalTable)
      .values({
        id: approval.id,
        sessionId: approval.sessionId,
        turnId: approval.turnId,
        toolCallId: approval.toolCallId,
        toolName: approval.toolName,
        input: approval.input,
        status: approval.status,
      })
      .onConflictDoUpdate({
        target: mobileAgentApprovalTable.id,
        set: { status: approval.status },
      });
  }

  /**
   * Startup reconciliation: a process death cannot resume a local turn, so
   * every unfinished turn and unsettled message becomes `interrupted`.
   */
  async reconcileInterrupted(error: AgentErrorView): Promise<number> {
    return this.dbService.withWriteTx(async (tx) => {
      const interruptedTurns = await tx
        .update(mobileAgentTurnTable)
        .set({ status: 'interrupted', error, endedAt: Date.now() })
        .where(inArray(mobileAgentTurnTable.status, [...NON_TERMINAL_TURN_STATUSES]))
        .returning({ id: mobileAgentTurnTable.id });
      await tx
        .update(mobileAgentMessageTable)
        .set({ status: 'interrupted' })
        .where(and(inArray(mobileAgentMessageTable.status, [...UNSETTLED_MESSAGE_STATUSES])));
      if (interruptedTurns.length > 0) {
        logger.info('Reconciled unfinished agent turns as interrupted', {
          count: interruptedTurns.length,
        });
      }
      return interruptedTurns.length;
    });
  }
}

export const mobileAgentSessionService = new MobileAgentSessionService();
