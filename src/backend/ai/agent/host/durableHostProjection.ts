import { z } from 'zod';

import {
  AgentInferenceSnapshotV1Schema,
  AgentMessagePartSchema,
  AgentMessageViewSchema,
  AgentTurnViewSchema,
  readAgentInferenceSnapshot,
  type AgentMessageView,
  type AgentTurnView,
} from '@/shared/contracts/agent';
import type { MessageRuntimeSpan, MessageRuntimeTiming } from '@/shared/data/types/message';

import type { RuntimeDurableTurn } from '../runtime';
import { toAgentErrorView, toAgentMessagePart } from './runtimeProjection';

/** Display identities accompany execution; terminal content and replay settle into Cherry. */
export const DurableTurnMetadataSchema = z.object({
  userParts: z.array(AgentMessagePartSchema),
  retainedParts: z.array(AgentMessagePartSchema).optional(),
  inferenceSnapshot: AgentInferenceSnapshotV1Schema,
  referencedFileEntryIds: z.array(z.string()),
  hasHistoryBeforeActiveTurn: z.boolean(),
});

/** The desktop-aligned message timing: wall clock, tool execution, and approval waits. */
export function durableRuntimeTiming(turn: RuntimeDurableTurn): MessageRuntimeTiming | undefined {
  const timing = turn.timing;
  if (!timing) return undefined;
  const spans: MessageRuntimeSpan[] = [
    ...timing.tools.map((tool) => ({
      id: `tool:${tool.toolCallId}`,
      kind: 'tool-execution' as const,
      toolCallId: tool.toolCallId,
      toolName: tool.toolName,
      startedAt: tool.startedAt,
      completedAt: Math.max(tool.startedAt, tool.completedAt),
    })),
    ...(timing.approvals ?? []).map((approval) => ({
      id: `approval:${approval.approvalId}`,
      kind: 'approval-wait' as const,
      approvalId: approval.approvalId,
      toolCallId: approval.toolCallId,
      ...(approval.toolName ? { toolName: approval.toolName } : {}),
      startedAt: approval.startedAt,
      ...(approval.completedAt !== undefined
        ? { completedAt: Math.max(approval.startedAt, approval.completedAt) }
        : {}),
    })),
  ].sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id));
  return {
    startedAt: timing.startedAt,
    ...(timing.completedAt !== undefined ? { completedAt: timing.completedAt } : {}),
    spans,
  };
}

export function projectDurableHostTurn(turn: RuntimeDurableTurn): {
  turn: AgentTurnView;
  user: AgentMessageView;
  assistant: AgentMessageView | null;
} {
  const metadata = DurableTurnMetadataSchema.parse(turn.metadata);
  const terminal = turn.status !== 'running' && turn.status !== 'queued';
  // A user stop is a settled, paused answer; it is not an execution failure.
  const error = turn.error && turn.status !== 'cancelled' ? toAgentErrorView(turn.error) : null;
  const common = {
    sessionId: turn.identity.sessionId,
    turnId: turn.identity.turnId,
    createdAt: new Date(turn.createdAt).toISOString(),
    updatedAt: new Date(turn.updatedAt).toISOString(),
    modelId: metadata.inferenceSnapshot.model.uniqueModelId,
    inferenceSnapshot: readAgentInferenceSnapshot(metadata.inferenceSnapshot),
    stats: null,
  };
  const user = AgentMessageViewSchema.parse({
    ...common,
    id: turn.userMessageId,
    role: 'user',
    status: 'success',
    parts: metadata.userParts,
  });
  const parts = [
    ...(metadata.retainedParts ?? []),
    ...turn.parts
      .filter((part) => !metadata.inferenceSnapshot.imageGeneration || part.type !== 'tool')
      .map(toAgentMessagePart),
  ];
  if (error)
    parts.push({ id: `durable-error:${turn.identity.requestId}`, type: 'data-error', data: error });
  const assistant = turn.hasAssistant
    ? AgentMessageViewSchema.parse({
        ...common,
        id: turn.assistantMessageId,
        stats: assistantStats(turn),
        role: 'assistant',
        status:
          turn.status === 'queued'
            ? 'pending'
            : turn.status === 'running'
              ? 'streaming'
              : turn.status === 'completed'
                ? 'success'
                : turn.status === 'failed'
                  ? 'error'
                  : turn.status,
        parts,
      })
    : null;
  const view = AgentTurnViewSchema.parse({
    id: turn.identity.turnId,
    sessionId: turn.identity.sessionId,
    status: turn.status === 'queued' ? 'running' : turn.status,
    assistantMessageId: turn.assistantMessageId,
    error,
    startedAt: common.createdAt,
    endedAt: terminal ? common.updatedAt : null,
  });
  return { turn: view, user, assistant };
}

function assistantStats(turn: RuntimeDurableTurn): AgentMessageView['stats'] {
  const runtimeTiming = durableRuntimeTiming(turn);
  if (!runtimeTiming && turn.contextTokens === undefined && !turn.usage) return null;
  return {
    ...(turn.usage
      ? {
          inputTokens: turn.usage.inputTokens,
          outputTokens: turn.usage.outputTokens,
          totalTokens: turn.usage.totalTokens,
        }
      : {}),
    ...(runtimeTiming ? { runtimeTiming } : {}),
    ...(turn.contextTokens !== undefined ? { contextTokens: turn.contextTokens } : {}),
  };
}
