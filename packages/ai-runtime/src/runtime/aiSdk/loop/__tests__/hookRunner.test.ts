import type { ToolSet } from 'ai';

import {
  type ToolExecutionEndEvent,
  type ToolExecutionStartEvent,
  wrapToolsWithExecutionHooks,
} from '../hookRunner';

const executeOptions = { toolCallId: 'call-1', messages: [] } as unknown as Parameters<
  NonNullable<ToolSet[string]['execute']>
>[1];

function makeTools(execute: ToolSet[string]['execute']): ToolSet {
  return { myTool: { execute } as ToolSet[string] };
}

describe('wrapToolsWithExecutionHooks', () => {
  it('returns the tools unchanged when no tool hooks are set', () => {
    const tools = makeTools(vi.fn());
    expect(wrapToolsWithExecutionHooks(tools, {})).toBe(tools);
  });

  it('fires start before execute and end after with the tool result', async () => {
    const order: string[] = [];
    const onToolExecutionStart = vi.fn<(event: ToolExecutionStartEvent) => void>(() => {
      order.push('start');
    });
    const onToolExecutionEnd = vi.fn<(event: ToolExecutionEndEvent) => void>(() => {
      order.push('end');
    });
    const execute = vi.fn(async () => {
      order.push('execute');
      return 'result';
    });

    const wrapped = wrapToolsWithExecutionHooks(makeTools(execute), {
      onToolExecutionStart,
      onToolExecutionEnd,
    });
    const output = await wrapped?.myTool.execute?.({ q: 1 }, executeOptions);

    expect(output).toBe('result');
    expect(order).toEqual(['start', 'execute', 'end']);
    expect(onToolExecutionStart).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'call-1', toolName: 'myTool', input: { q: 1 } }),
    );
    expect(onToolExecutionEnd.mock.calls[0]?.[0].toolOutput).toEqual({
      type: 'tool-result',
      output: 'result',
    });
  });

  it('fires end with a tool error and rethrows', async () => {
    const error = new Error('tool failed');
    const onToolExecutionEnd = vi.fn();
    const wrapped = wrapToolsWithExecutionHooks(
      makeTools(async () => {
        throw error;
      }),
      { onToolExecutionEnd },
    );

    await expect(wrapped?.myTool.execute?.({}, executeOptions)).rejects.toBe(error);
    expect(onToolExecutionEnd).toHaveBeenCalledWith(
      expect.objectContaining({ toolOutput: { type: 'tool-error', error } }),
    );
  });
});
