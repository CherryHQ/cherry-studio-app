import type { Context } from '@earendil-works/chord';
import type { Message, SystemMessage } from '@earendil-works/pi-ai';
import { defineDoc, type HookApi, type ToolHookCall } from '@earendil-works/pi-durable';

/** Per-run tool budget. Exhaustion asks for one final tool-free answer instead of failing. */
export const PI_TOOL_BUDGET = Object.freeze({ maxToolCalls: 64, maxToolSteps: 20 });

/** One bounded admission ledger, shared by model calls and nested calls across recovery. */
export const PiToolBudget = defineDoc<{
  inputId: number;
  modelCalls: string[];
  nestedCalls: string[];
  failedGroups: string[];
  finalResponseModelCalls?: number;
}>({
  kind: 'cherry.tool-budget',
  version: 1,
  scope: 'conversation',
  history: 'latest',
  fork: 'current',
  initial: () => ({ inputId: 0, modelCalls: [], nestedCalls: [], failedGroups: [] }),
});

export function admitPiToolCall(
  api: HookApi,
  context: Context,
  inputId: number,
  call: ToolHookCall,
  modelCalls: readonly string[],
) {
  return api.commit(async (tx) => {
    const budget = await tx.doc(PiToolBudget, api.conversationId);
    if (budget.inputId !== inputId) {
      budget.inputId = inputId;
      budget.modelCalls = [];
      budget.nestedCalls = [];
      budget.failedGroups = [];
      delete budget.finalResponseModelCalls;
    }
    for (const id of modelCalls) {
      if (budget.modelCalls.includes(id)) continue;
      if (budget.modelCalls.length + budget.nestedCalls.length >= PI_TOOL_BUDGET.maxToolCalls)
        break;
      budget.modelCalls.push(id);
    }
    if (!call.parent) return budget.modelCalls.includes(call.id);
    if (budget.nestedCalls.includes(call.id)) return true;
    if (budget.modelCalls.length + budget.nestedCalls.length >= PI_TOOL_BUDGET.maxToolCalls)
      return false;
    budget.nestedCalls.push(call.id);
    return true;
  }, context);
}

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
  nestedToolCalls = 0,
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
    steps.slice(0, count).reduce((total, calls) => total + calls, nestedToolCalls) >=
      budget.maxToolCalls;
  // Nested calls belong to the current budget, not to every earlier model step. Their final
  // response boundary is recorded by the request hook instead of inferred from the transcript.
  if (
    steps.length > 0 &&
    (steps.length - 1 >= budget.maxToolSteps ||
      steps.slice(0, -1).reduce((total, calls) => total + calls, 0) >= budget.maxToolCalls)
  )
    return 'exceeded';
  return exhaustedAfter(steps.length) ? 'final-response' : 'available';
}
