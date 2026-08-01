import { stepCountIs, type StepResult, type StopCondition, type ToolSet } from 'ai';

import { getTrustedLocalToolTerminalFailure } from './localToolTerminalOutcome';

type ToolLoopStopWhen = StopCondition<ToolSet> | StopCondition<ToolSet>[] | undefined;
type StopReason = 'tool-call-limit';
type StopState = { reason: StopReason; step: StepResult<ToolSet> | undefined };

const trackedStopConditions = new WeakMap<StopCondition<ToolSet>, StopState>();
const TOOL_CALL_LIMIT_MESSAGE =
  'The assistant reached the tool-call limit before producing a final answer. Try again or reduce the task scope.';

function trackStopCondition(
  reason: StopReason,
  condition: StopCondition<ToolSet>,
): StopCondition<ToolSet> {
  const state: StopState = { reason, step: undefined };
  const tracked: StopCondition<ToolSet> = async ({ steps }) => {
    const shouldStop = await condition({ steps });
    state.step = shouldStop ? steps.at(-1) : undefined;
    return shouldStop;
  };
  trackedStopConditions.set(tracked, state);
  return tracked;
}

export function createToolCallLimitStopCondition(limit: number): StopCondition<ToolSet> {
  return trackStopCondition('tool-call-limit', stepCountIs(limit));
}

export function getLastTerminalToolFailure(steps: StepResult<ToolSet>[]) {
  const lastStep = steps.at(-1);
  if (!lastStep) return undefined;
  for (const result of lastStep.toolResults) {
    if (result.providerExecuted) continue;
    const failure = getTrustedLocalToolTerminalFailure(result.output);
    if (failure) return failure;
  }
  return undefined;
}

export const stopOnTerminalToolFailure: StopCondition<ToolSet> = ({ steps }) =>
  getLastTerminalToolFailure(steps) !== undefined;

export class ToolLoopTerminalError extends Error {
  constructor(
    message: string,
    public readonly i18nKey?: string,
  ) {
    super(message);
    this.name = 'ToolLoopTerminalError';
  }
}

export function resolveToolLoopTerminalError(input: {
  steps: StepResult<ToolSet>[];
  stopWhen: ToolLoopStopWhen;
}): ToolLoopTerminalError | undefined {
  const terminalFailure = getLastTerminalToolFailure(input.steps);
  if (terminalFailure) {
    return new ToolLoopTerminalError(
      terminalFailure.userMessage ?? terminalFailure.error,
      terminalFailure.i18nKey,
    );
  }

  const finalStep = input.steps.at(-1);
  if (!finalStep || !input.stopWhen) return undefined;
  const conditions = Array.isArray(input.stopWhen) ? input.stopWhen : [input.stopWhen];
  const reachedLimit = conditions.some((condition) => {
    const state = trackedStopConditions.get(condition);
    return state?.reason === 'tool-call-limit' && state.step === finalStep;
  });
  return reachedLimit
    ? new ToolLoopTerminalError(TOOL_CALL_LIMIT_MESSAGE, 'tool_call_limit_reached')
    : undefined;
}
