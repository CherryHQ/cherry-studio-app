import type { Message, SystemMessage } from '@earendil-works/pi-ai';

/** Per-run tool budget. Exhaustion asks for one final tool-free answer instead of failing. */
export const PI_TOOL_BUDGET = Object.freeze({ maxToolCalls: 64, maxToolSteps: 20 });

export const PI_TOOL_BUDGET_FINAL_RESPONSE: SystemMessage = Object.freeze({
  role: 'system',
  content:
    'The tool budget for this turn is exhausted. Tools are now unavailable. ' +
    'Give your final answer using the information already collected. ' +
    'Clearly state any remaining uncertainty or unfinished work; do not invent results or request more tools.',
}) as SystemMessage;

export class PiToolBudgetExceededError extends Error {
  readonly code = 'tool_call_limit_exceeded';
  readonly retryable = false;
  constructor() {
    super('The turn kept calling tools after its tool budget was exhausted.');
  }
}

/**
 * Classify the next request of the run that the latest user input started. `exceeded` means the
 * model already used tools after a tool-free final request.
 */
export function piToolBudgetState(
  messages: readonly Message[],
  budget: { maxToolCalls: number; maxToolSteps: number } = PI_TOOL_BUDGET,
): 'available' | 'final-response' | 'exceeded' {
  const start = messages.findLastIndex((message) => message.role === 'user') + 1;
  const steps = messages
    .slice(start)
    .flatMap((message) =>
      message.role === 'assistant'
        ? [message.content.filter((block) => block.type === 'toolCall').length]
        : [],
    )
    .filter((calls) => calls > 0);
  const exhaustedAfter = (count: number) =>
    count >= budget.maxToolSteps ||
    steps.slice(0, count).reduce((total, calls) => total + calls, 0) >= budget.maxToolCalls;
  if (steps.length > 0 && exhaustedAfter(steps.length - 1)) return 'exceeded';
  return exhaustedAfter(steps.length) ? 'final-response' : 'available';
}
