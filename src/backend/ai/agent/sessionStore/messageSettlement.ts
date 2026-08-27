import type { AgentMessagePart } from '@/shared/contracts/agent';

import { createInterruptedToolResult } from '../runtime';

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
