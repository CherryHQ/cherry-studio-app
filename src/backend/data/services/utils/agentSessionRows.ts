import { loggerService } from '@logger';
import { sql } from 'drizzle-orm';

import {
  agentSessionMessageTable,
  type AgentSessionMessageRow,
  type AgentSessionRow,
} from '@/backend/data/db/schemas';
import {
  AgentMessageViewSchema,
  AgentSessionViewSchema,
  readAgentInferenceSnapshot,
  type AgentMessageView,
  type AgentSessionView,
} from '@/shared/contracts/agent';
import {
  type AgentSessionEntity,
  AgentSessionEntitySchema,
} from '@/shared/data/api/schemas/agentSessions';

import { timestampToISO } from './rowMappers';

const logger = loggerService.withContext('agentSessionRows');

export function toAgentSessionView(row: AgentSessionRow): AgentSessionView {
  return AgentSessionViewSchema.parse({
    id: row.id,
    agentId: row.agentId,
    executionTarget: row.executionTarget,
    title: row.title,
    titleIsManual: row.titleIsManual,
    forkBoundaryMessageId: row.forkBoundaryMessageId,
    forkedFromSessionId: row.forkedFromSessionId,
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  });
}

export function toAgentSessionEntity(row: AgentSessionRow): AgentSessionEntity {
  return AgentSessionEntitySchema.parse({
    ...toAgentSessionView(row),
    lastActivityAt: timestampToISO(row.lastActivityAt),
  });
}

/**
 * The columns a message view reads. Transcript reads select these instead of
 * the whole row, leaving out the context checkpoint (up to 256 KiB), the turn
 * error, and the search-index copy of the text.
 */
export const agentMessageViewColumns = {
  id: agentSessionMessageTable.id,
  sessionId: agentSessionMessageTable.sessionId,
  turnId: agentSessionMessageTable.turnId,
  role: agentSessionMessageTable.role,
  status: agentSessionMessageTable.status,
  data: agentSessionMessageTable.data,
  usage: agentSessionMessageTable.usage,
  stats: agentSessionMessageTable.stats,
  modelId: agentSessionMessageTable.modelId,
  messageSnapshot: agentSessionMessageTable.messageSnapshot,
  createdAt: agentSessionMessageTable.createdAt,
  updatedAt: agentSessionMessageTable.updatedAt,
};

export type AgentMessageViewRow = Pick<
  AgentSessionMessageRow,
  keyof typeof agentMessageViewColumns
>;

type AgentMessageViewSqlRow = Omit<
  AgentMessageViewRow,
  'data' | 'messageSnapshot' | 'stats' | 'usage'
> & {
  data: string;
  messageSnapshot: string | null;
  stats: string | null;
  usage: string | null;
};

/** {@link agentMessageViewColumns} for raw SQL over `agent_session_message AS message`. */
export const agentMessageViewSqlColumns = sql`message.id, message.session_id AS "sessionId",
  message.turn_id AS "turnId", message.role, message.status, message.data, message.usage,
  message.stats, message.model_id AS "modelId", message.message_snapshot AS "messageSnapshot",
  message.created_at AS "createdAt", message.updated_at AS "updatedAt"`;

/** Decodes the JSON columns of an {@link agentMessageViewSqlColumns} row, as Drizzle would. */
export function fromAgentMessageViewSqlRow(row: AgentMessageViewSqlRow): AgentMessageViewRow {
  return {
    ...row,
    data: JSON.parse(row.data) as AgentMessageViewRow['data'],
    messageSnapshot: parseNullableJson(row.messageSnapshot),
    stats: parseNullableJson(row.stats),
    usage: parseNullableJson(row.usage),
  };
}

function parseNullableJson<TValue>(value: string | null): TValue | null {
  return value === null ? null : (JSON.parse(value) as TValue);
}

export function toAgentMessageView(row: AgentMessageViewRow): AgentMessageView {
  if (row.data.version !== 1) {
    throw new Error(`Unknown agent message data version: ${String(row.data.version)}`);
  }
  return AgentMessageViewSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    turnId: row.turnId,
    role: row.role,
    status: row.status,
    parts: row.data.parts,
    usage: row.usage ?? null,
    stats: row.stats ?? null,
    modelId: row.modelId,
    inferenceSnapshot: readAgentInferenceSnapshot(row.messageSnapshot),
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  });
}

/**
 * Transcript reads skip a row that no longer satisfies the message contract
 * (unknown data version or schema drift). Throwing would fail every page that
 * contains the row, and retrying that read could never succeed.
 */
export function toReadableAgentMessageViews(
  rows: readonly AgentMessageViewRow[],
): AgentMessageView[] {
  return rows.flatMap((row) => {
    try {
      return [toAgentMessageView(row)];
    } catch (error) {
      logger.warn('Skipping unreadable agent message', error as Error, {
        messageId: row.id,
        sessionId: row.sessionId,
      });
      return [];
    }
  });
}
