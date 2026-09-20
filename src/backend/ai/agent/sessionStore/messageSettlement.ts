import type { AgentErrorView, AgentMessagePart } from '@/shared/contracts/agent';

import { createInterruptedToolResult } from '../runtime';

/** Only completed folds belong to persisted history, including interrupted turns. */
export function omitTransientCompactionParts(parts: AgentMessagePart[]): AgentMessagePart[] {
  return parts.filter(
    (part) => part.type !== 'data-compaction-anchor' || part.data.status === 'done',
  );
}

export function interruptNonTerminalToolParts(
  parts: AgentMessagePart[],
  reason: string,
): AgentMessagePart[] {
  return parts.map((part) => {
    if (
      part.type !== 'tool' ||
      (part.state !== 'input-streaming' &&
        part.state !== 'input-available' &&
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

/** Closes text and reasoning parts that were still streaming when the turn ended. */
export function settleStreamingTextParts(parts: AgentMessagePart[]): AgentMessagePart[] {
  return parts.map((part) =>
    (part.type === 'text' || part.type === 'reasoning') && part.state === 'streaming'
      ? { ...part, state: 'done' }
      : part,
  );
}

/**
 * Makes a recovered assistant placeholder self-describing in transcript reads.
 * Parts persisted while the turn streamed are kept: text closes as `done`,
 * unfinished tool calls become `interrupted`, and the turn error is appended.
 */
export function settleInterruptedAssistantParts(
  parts: AgentMessagePart[],
  error: AgentErrorView,
  errorPartId: string,
): AgentMessagePart[] {
  return [
    ...interruptNonTerminalToolParts(
      settleStreamingTextParts(omitTransientCompactionParts(parts)),
      error.message,
    ),
    { id: errorPartId, type: 'error', error },
  ];
}
