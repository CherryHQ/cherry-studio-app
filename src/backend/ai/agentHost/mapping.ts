/**
 * Pure mappings between the Agent Runtime contract and the Agent Protocol.
 * The Host is the only adapter between the two; neither side's shape leaks
 * through the other.
 */

import {
  createInterruptedToolResult,
  type RuntimeApproval,
  type RuntimeError,
  type RuntimeHistoryTurn,
  type RuntimeInputPart,
  type RuntimeMessage,
  type RuntimeMessagePart,
  type RuntimeOutputPart,
  type RuntimeUsage,
} from '@/backend/ai/agent';
import {
  AgentFailureSnapshotSchema,
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
import { classifyAgentFailureReason } from '@/shared/utils/agentFailure';

import type { TurnResourceLedger } from './managedFileResolver';

export type RuntimeAttachmentContents = ReadonlyMap<string, RuntimeInputPart>;

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
    message,
    retryable: error.retryable,
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

export function toRuntimeInputParts(
  parts: AgentInputPart[],
  resources?: Pick<TurnResourceLedger, 'fileEntryIds'>,
  attachments?: RuntimeAttachmentContents,
): RuntimeInputPart[] {
  return parts.flatMap((part): RuntimeInputPart[] => {
    if (part.type === 'file') {
      if (!resources?.fileEntryIds.has(part.fileEntryId)) {
        throw new Error('Managed file input is outside the turn resource ledger.');
      }
      const attachment = attachments?.get(part.fileEntryId);
      if (!attachment) {
        throw new Error('Managed file input has no resolved Runtime content.');
      }
      return [attachment];
    }
    return [{ type: 'text', text: part.text }];
  });
}

/**
 * Persisted protocol transcript to normalized runtime history. Tool parts
 * expand into `tool-call` + `tool-result` pairs; protocol `error` parts stay
 * behind the boundary (they describe the turn, not model-visible content).
 */
export function toRuntimeHistory(
  messages: AgentMessageView[],
  attachments: RuntimeAttachmentContents = new Map(),
): RuntimeHistoryTurn[] {
  const history: RuntimeHistoryTurn[] = [];
  for (const message of messages) {
    const parts: RuntimeMessagePart[] = [];
    for (const part of message.parts) {
      switch (part.type) {
        case 'text':
        case 'reasoning':
          parts.push({ type: part.type, text: part.text });
          break;
        case 'file':
          if (message.role === 'user' && part.purpose === 'input-attachment') {
            const attachment = attachments.get(part.fileEntryId);
            if (attachment) {
              parts.push(attachment);
            }
          }
          // Missing historical input content is omitted. Assistant artifacts
          // never become implicit model attachments.
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
    const currentTurn = history.at(-1);
    const runtimeTurn =
      message.turnId !== null && currentTurn?.turnId === message.turnId
        ? currentTurn
        : { turnId: message.turnId, messages: [] };
    if (runtimeTurn !== currentTurn) {
      history.push(runtimeTurn);
    }
    if (parts.length > 0) {
      const runtimeMessage: RuntimeMessage = {
        role: message.role,
        parts,
        ...(message.role === 'assistant' && message.usage ? { usage: message.usage } : {}),
      };
      runtimeTurn.messages.push(runtimeMessage);
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
