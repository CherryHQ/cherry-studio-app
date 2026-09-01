import type { AgentSessionMessageRow, AgentSessionRow } from '@/backend/data/db/schemas';
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

export function toAgentSessionView(row: AgentSessionRow): AgentSessionView {
  return AgentSessionViewSchema.parse({
    id: row.id,
    agentId: row.agentId,
    executionTarget: row.executionTarget,
    title: row.title,
    titleIsManual: row.titleIsManual,
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

export function toAgentMessageView(row: AgentSessionMessageRow): AgentMessageView {
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
    modelId: row.modelId,
    inferenceSnapshot: readAgentInferenceSnapshot(row.messageSnapshot),
    createdAt: timestampToISO(row.createdAt),
    updatedAt: timestampToISO(row.updatedAt),
  });
}
