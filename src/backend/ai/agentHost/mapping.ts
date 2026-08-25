/**
 * Pure mappings between the Agent Runtime contract and the Agent Protocol.
 * The Host is the only adapter between the two; neither side's shape leaks
 * through the other.
 */

import type {
  RuntimeApproval,
  RuntimeError,
  RuntimeInputPart,
  RuntimeMessage,
  RuntimeMessagePart,
  RuntimeOutputPart,
  RuntimeUsage,
} from '@/backend/ai/agent';
import type {
  AgentApprovalView,
  AgentErrorView,
  AgentInputPart,
  AgentMessagePart,
  AgentMessageView,
  AgentUsageView,
} from '@/shared/contracts/agent';

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
    return {
      id: part.id,
      type: 'file',
      mediaType: part.mediaType,
      ...(part.name !== undefined ? { name: part.name } : {}),
      uri: part.uri,
    };
  }
  if (part.type === 'tool') {
    return {
      id: part.id,
      type: 'tool',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      state: part.state,
      ...(part.input !== undefined ? { input: part.input } : {}),
      ...(part.output !== undefined ? { output: part.output } : {}),
      ...(part.approvalId !== undefined ? { approvalId: part.approvalId } : {}),
      ...(part.error !== undefined ? { error: toAgentErrorView(part.error) } : {}),
    };
  }
  return { id: part.id, type: part.type, text: part.text, state: part.state };
}

export function toAgentApprovalView(
  approval: RuntimeApproval,
  sessionId: string,
): AgentApprovalView {
  return {
    id: approval.id,
    sessionId,
    turnId: approval.turnId,
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    input: approval.input,
    status: approval.status,
  };
}

export function toAgentUsageView(usage: RuntimeUsage): AgentUsageView {
  return {
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
  };
}

export function toRuntimeInputParts(parts: AgentInputPart[]): RuntimeInputPart[] {
  return parts.map((part) =>
    part.type === 'text'
      ? { type: 'text', text: part.text }
      : {
          type: 'file',
          mediaType: part.mediaType,
          ...(part.name !== undefined ? { name: part.name } : {}),
          uri: part.uri,
        },
  );
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
          parts.push({
            type: 'file',
            mediaType: part.mediaType,
            ...(part.name !== undefined ? { name: part.name } : {}),
            uri: part.uri,
          });
          break;
        case 'tool':
          parts.push({
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input ?? null,
          });
          if (
            part.state === 'output-available' ||
            part.state === 'denied' ||
            part.state === 'error'
          ) {
            parts.push({
              type: 'tool-result',
              toolCallId: part.toolCallId,
              output: part.output ?? null,
              isError: part.state === 'error',
            });
          }
          break;
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
