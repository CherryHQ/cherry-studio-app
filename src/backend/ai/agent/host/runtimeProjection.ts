/**
 * Runtime output projected onto the Agent Protocol. The Host is the only
 * adapter between the two; neither side's shape leaks through the other.
 * `turnRuntimeInput.ts` owns the opposite direction.
 */

import {
  AgentApprovalViewSchema,
  AgentMessagePartSchema,
  type AgentApprovalView,
  type AgentErrorView,
  type AgentMessagePart,
  type AgentUsageView,
} from '@/shared/contracts/agent';
import { createAiFailure } from '@/shared/utils/createAiFailure';

import type { RuntimeApproval, RuntimeError, RuntimeOutputPart, RuntimeUsage } from '../runtime';

export function toAgentErrorView(error: RuntimeError): AgentErrorView {
  return { code: 'EXECUTION_FAILED', ...createAiFailure(error) };
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
    const runtimeOutput = part.output;
    const output = runtimeOutput?.failure
      ? {
          value: {
            status: 'error',
            error: {
              code: runtimeOutput.failure.error.code,
              message: runtimeOutput.failure.error.message,
              retryable: runtimeOutput.failure.error.retryable,
            },
            details: runtimeOutput.value,
          },
          artifacts: runtimeOutput.artifacts,
        }
      : runtimeOutput;
    return AgentMessagePartSchema.parse({
      id: part.id,
      type: 'tool',
      toolCallId: part.toolCallId,
      toolRef: part.toolRef,
      providerName: part.providerName,
      displayName: part.displayName,
      state: part.state,
      ...(part.input !== undefined ? { input: part.input } : {}),
      ...(part.inputPreview !== undefined ? { inputPreview: part.inputPreview } : {}),
      ...(output !== undefined ? { output } : {}),
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
