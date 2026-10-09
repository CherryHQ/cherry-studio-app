import { loggerService } from '@logger';
import { sql } from 'drizzle-orm';

import {
  agentSessionMessageTable,
  type AgentSessionMessageRow,
  type AgentSessionRow,
} from '@/backend/data/db/schemas';
import {
  AgentMessageViewSchema,
  AgentMessagePartSchema,
  AgentSessionViewSchema,
  readAgentInferenceSnapshot,
  type AgentMessageView,
  type AgentMessagePart,
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
    name: row.name,
    isNameManuallyEdited: row.isNameManuallyEdited,
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
  stats: agentSessionMessageTable.stats,
  modelId: agentSessionMessageTable.modelId,
  inferenceSnapshot: agentSessionMessageTable.inferenceSnapshot,
  createdAt: agentSessionMessageTable.createdAt,
  updatedAt: agentSessionMessageTable.updatedAt,
};

export type AgentMessageViewRow = Pick<
  AgentSessionMessageRow,
  keyof typeof agentMessageViewColumns
>;

type AgentMessageViewSqlRow = Omit<AgentMessageViewRow, 'data' | 'inferenceSnapshot' | 'stats'> & {
  data: string;
  inferenceSnapshot: string | null;
  stats: string | null;
};

/** {@link agentMessageViewColumns} for raw SQL over `agent_session_message AS message`. */
export const agentMessageViewSqlColumns = sql`message.id, message.session_id AS "sessionId",
  message.turn_id AS "turnId", message.role, message.status, message.data,
  message.stats, message.model_id AS "modelId", message.inference_snapshot AS "inferenceSnapshot",
  message.created_at AS "createdAt", message.updated_at AS "updatedAt"`;

/** Decodes the JSON columns of an {@link agentMessageViewSqlColumns} row, as Drizzle would. */
export function fromAgentMessageViewSqlRow(row: AgentMessageViewSqlRow): AgentMessageViewRow {
  return {
    ...row,
    data: JSON.parse(row.data) as AgentMessageViewRow['data'],
    inferenceSnapshot: parseNullableJson(row.inferenceSnapshot),
    stats: parseNullableJson(row.stats),
  };
}

function parseNullableJson<TValue>(value: string | null): TValue | null {
  return value === null ? null : (JSON.parse(value) as TValue);
}

export function toAgentMessageView(row: AgentMessageViewRow): AgentMessageView {
  return AgentMessageViewSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    turnId: row.turnId,
    role: row.role,
    status: row.status,
    parts: row.data.parts,
    stats: row.stats ?? null,
    modelId: row.modelId,
    inferenceSnapshot: readAgentInferenceSnapshot(row.inferenceSnapshot),
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  });
}

/**
 * Display reads isolate unreadable parts without hiding the message or rewriting
 * history. Runtime replay continues to use the strict toAgentMessageView reader.
 */
export function toReadableAgentMessageViews(
  rows: readonly AgentMessageViewRow[],
): AgentMessageView[] {
  return rows.flatMap((row) => {
    try {
      return [toAgentMessageView(row)];
    } catch {
      // Only malformed history needs the per-part recovery pass below.
    }
    try {
      const parts: unknown[] = Array.isArray(row.data?.parts) ? row.data.parts : [null];
      const readableParts = parts.map((part, index): AgentMessagePart => {
        const parsed = AgentMessagePartSchema.safeParse(part);
        if (parsed.success) return parsed.data;
        logger.warn('Unreadable agent message part', parsed.error, {
          messageId: row.id,
          partIndex: index,
          partType:
            typeof part === 'object' && part !== null && 'type' in part
              ? String(part.type)
              : typeof part,
        });
        return {
          id: `unreadable-${row.id}-${index}`,
          type: 'data-error',
          data: {
            code: 'MESSAGE_UNREADABLE',
            message: 'This stored message part is malformed or unsupported.',
            retryable: false,
          },
        };
      });
      return [toAgentMessageView({ ...row, data: { parts: readableParts } })];
    } catch (error) {
      logger.warn('Skipping unreadable agent message', error as Error, {
        messageId: row.id,
        sessionId: row.sessionId,
      });
      return [];
    }
  });
}
