import type { StepResult, ToolSet } from 'ai';

import {
  createToolCallLimitStopCondition,
  resolveToolLoopTerminalError,
  trackSteerYieldStopCondition,
} from '../toolLoopTermination';

describe('toolLoopTermination', () => {
  test('treats a tracked steer yield as a clean stop', async () => {
    const step = createStep();
    const steer = trackSteerYieldStopCondition(() => true);
    await steer({ steps: [step] });

    expect(resolveToolLoopTerminalError({ steps: [step], stopWhen: [steer] })).toBeUndefined();
  });

  test('lets a steer yield win when the tool-call limit fires on the same step', async () => {
    const step = createStep();
    const limit = createToolCallLimitStopCondition(1);
    const steer = trackSteerYieldStopCondition(() => true);
    await Promise.all([limit({ steps: [step] }), steer({ steps: [step] })]);

    expect(
      resolveToolLoopTerminalError({ steps: [step], stopWhen: [limit, steer] }),
    ).toBeUndefined();
  });
});

function createStep(): StepResult<ToolSet> {
  return { toolResults: [] } as unknown as StepResult<ToolSet>;
}
