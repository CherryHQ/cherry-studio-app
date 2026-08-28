/**
 * Runtime output projected onto the Agent Protocol. The Host is the only
 * adapter between the two; neither side's shape leaks through the other.
 * `turnRuntimeInput.ts` owns the opposite direction.
 */

import {
  AgentFailureSnapshotSchema,
  AgentApprovalViewSchema,
  AgentMessagePartSchema,
  type AgentApprovalView,
  type AgentErrorView,
  type AgentMessagePart,
  type AgentUsageView,
} from '@/shared/contracts/agent';
import { classifyAgentFailureReason } from '@/shared/utils/agentFailure';

import type { RuntimeApproval, RuntimeError, RuntimeOutputPart, RuntimeUsage } from '../runtime';

const MAX_ERROR_CODE_CHARS = 128;
const MAX_ERROR_MESSAGE_CHARS = 4_000;
const MAX_ERROR_CONTEXT_CHARS = 4_000;

function bounded(value: string, maxChars: number): string {
  const trimmed = value.trim();
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed;
}

function boundedOptional(value: string | undefined, maxChars: number): string | undefined {
  if (value === undefined) return undefined;
  return bounded(value, maxChars) || undefined;
}

/**
 * Keep the closed protocol error code as the transport envelope while
 * preserving the Runtime/Provider identity in a versioned, JSON-safe snapshot.
 */
export function toAgentErrorView(error: RuntimeError): AgentErrorView {
  const code = bounded(error.code, MAX_ERROR_CODE_CHARS) || 'runtime_error';
  const message = bounded(error.message, MAX_ERROR_MESSAGE_CHARS) || 'The Agent turn failed.';
  const rawStatusCode = error.context?.statusCode;
  const statusCode =
    typeof rawStatusCode === 'number' &&
    Number.isSafeInteger(rawStatusCode) &&
    rawStatusCode >= 100 &&
    rawStatusCode <= 599
      ? rawStatusCode
      : undefined;
  const providerId = boundedOptional(error.context?.providerId, 256);
  const modelId = boundedOptional(error.context?.modelId, 256);
  const finishReason = boundedOptional(error.context?.finishReason, 256);
  const responseBody = boundedOptional(error.context?.responseBody, MAX_ERROR_CONTEXT_CHARS);
  const context = {
    ...(statusCode !== undefined ? { statusCode } : {}),
    ...(providerId !== undefined ? { providerId } : {}),
    ...(modelId !== undefined ? { modelId } : {}),
    ...(finishReason !== undefined ? { finishReason } : {}),
    ...(responseBody !== undefined ? { responseBody } : {}),
  };
  const name = boundedOptional(error.name, 256);
  const failure = AgentFailureSnapshotSchema.parse({
    version: 1,
    reasonCode: classifyAgentFailureReason({
      code,
      message,
      ...(name !== undefined ? { name } : {}),
      ...(statusCode !== undefined ? { statusCode } : {}),
      ...(finishReason !== undefined ? { finishReason } : {}),
      ...(responseBody !== undefined ? { responseBody } : {}),
    }),
    source: {
      layer: error.origin ?? 'runtime',
      code,
      ...(name !== undefined ? { name } : {}),
    },
    ...(Object.keys(context).length > 0 ? { context } : {}),
  });

  return {
    code: 'EXECUTION_FAILED',
    message,
    retryable: error.retryable,
    failure,
  };
}

export function toAgentMessagePart(part: RuntimeOutputPart): AgentMessagePart {
  if (part.type === 'file') {
    return AgentMessagePartSchema.parse({
      id: part.id,
      type: 'file',
      fileEntryId: part.ref.fileEntryId,
      mediaType: part.mediaType,
      name: part.name,
      purpose: part.purpose,
    });
  }
  if (part.type === 'tool') {
    return AgentMessagePartSchema.parse({
      id: part.id,
      type: 'tool',
      toolCallId: part.toolCallId,
      toolRef: part.toolRef,
      providerName: part.providerName,
      displayName: part.displayName,
      state: part.state,
      ...(part.input !== undefined ? { input: part.input } : {}),
      ...(part.output !== undefined ? { output: part.output } : {}),
      ...(part.approvalId !== undefined ? { approvalId: part.approvalId } : {}),
      ...(part.error !== undefined ? { error: toAgentErrorView(part.error) } : {}),
    });
  }
  return AgentMessagePartSchema.parse({
    id: part.id,
    type: part.type,
    text: part.text,
    state: part.state,
  });
}

export function toAgentApprovalView(
  approval: RuntimeApproval,
  sessionId: string,
): AgentApprovalView {
  return AgentApprovalViewSchema.parse({
    id: approval.id,
    sessionId,
    turnId: approval.turnId,
    toolCallId: approval.toolCallId,
    toolRef: approval.toolRef,
    displayName: approval.displayName,
    input: approval.input,
    status: approval.status,
  });
}

export function toAgentUsageView(usage: RuntimeUsage): AgentUsageView {
  return {
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
  };
}
