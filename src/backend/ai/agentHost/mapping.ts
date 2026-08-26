/**
 * Pure mappings between the Agent Runtime contract and the Agent Protocol.
 * The Host is the only adapter between the two; neither side's shape leaks
 * through the other.
 */

import {
  createInterruptedToolResult,
  type RuntimeApproval,
  type RuntimeError,
  type RuntimeInputPart,
  type RuntimeMessage,
  type RuntimeMessagePart,
  type RuntimeOutputPart,
  type RuntimeUsage,
} from '@/backend/ai/agent';
import {
  AgentApprovalViewSchema,
  AgentMessagePartSchema,
  AgentToolResultSchema,
  type AgentApprovalView,
  type AgentErrorView,
  type AgentInputPart,
  type AgentMessagePart,
  type AgentMessageView,
  type AgentUsageView,
} from '@/shared/contracts/agent';

import type { TurnResourceLedger } from './managedFileResolver';

/**
 * Runtime error codes are implementation-scoped strings; the protocol enum is
 * closed. Every runtime failure surfaces as EXECUTION_FAILED with the
 * normalized (already secret-free) runtime message.
 */
export function toAgentErrorView(error: RuntimeError): AgentErrorView {
  return {
    code: 'EXECUTION_FAILED',
    message: error.message,
    retryable: error.retryable,
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

export function toRuntimeInputParts(
  parts: AgentInputPart[],
  resources?: Pick<TurnResourceLedger, 'fileEntryIds'>,
): RuntimeInputPart[] {
  return parts.flatMap((part): RuntimeInputPart[] => {
    if (part.type === 'file') {
      if (!resources?.fileEntryIds.has(part.fileEntryId)) {
        throw new Error('Managed file input is outside the turn resource ledger.');
      }
      // A1 persists only the managed reference. A2/A3 own the bounded
      // temporary conversion to Runtime image/text input.
      return [];
    }
    return [{ type: 'text', text: part.text }];
  });
}

/**
 * Persisted protocol transcript to normalized runtime history. Tool parts
 * expand into `tool-call` + `tool-result` pairs; protocol `error` parts stay
 * behind the boundary (they describe the turn, not model-visible content).
 */
export function toRuntimeHistory(messages: AgentMessageView[]): RuntimeMessage[] {
  const history: RuntimeMessage[] = [];
  for (const message of messages) {
    const parts: RuntimeMessagePart[] = [];
    for (const part of message.parts) {
      switch (part.type) {
        case 'text':
        case 'reasoning':
          parts.push({ type: part.type, text: part.text });
          break;
        case 'file':
          // C1 has no Host-side managed-file resolver. Artifact parts never
          // become implicit model attachments, and input attachments remain
          // unavailable until the attachment slice resolves them explicitly.
          break;
        case 'tool': {
          const validPart = AgentMessagePartSchema.safeParse(part);
          const output = AgentToolResultSchema.safeParse(part.output);
          if (
            validPart.success &&
            (part.state === 'output-available' ||
              part.state === 'denied' ||
              part.state === 'error' ||
              part.state === 'interrupted') &&
            output.success
          ) {
            parts.push({
              type: 'tool-call',
              toolCallId: part.toolCallId,
              toolRef: part.toolRef,
              providerName: part.providerName,
              input: part.input ?? null,
            });
            parts.push({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              output: output.data,
              isError: part.state === 'error' || part.state === 'interrupted',
            });
          }
          break;
        }
        default:
          break;
      }
    }
    if (parts.length > 0) {
      history.push({ role: message.role, parts });
    }
  }
  return history;
}

export function interruptNonTerminalToolParts(
  parts: AgentMessagePart[],
  reason: string,
): AgentMessagePart[] {
  return parts.map((part) => {
    if (
      part.type !== 'tool' ||
      (part.state !== 'input-available' &&
        part.state !== 'awaiting-approval' &&
        part.state !== 'running')
    ) {
      return part;
    }
    const { approvalId: _approvalId, error: _error, output: _output, ...base } = part;
    return {
      ...base,
      state: 'interrupted',
      output: createInterruptedToolResult(reason),
    };
  });
}
