import { type Tool, type ToolSet, tool } from 'ai';
import * as z from 'zod';

import { applyDeferExposition } from '../exposition/applyDeferExposition';
import { shouldDefer } from '../exposition/shouldDefer';
import { TOOL_INSPECT_TOOL_NAME } from '../meta/toolInspect';
import { TOOL_INVOKE_TOOL_NAME } from '../meta/toolInvoke';
import { TOOL_SEARCH_TOOL_NAME } from '../meta/toolSearch';
import { ToolRegistry } from '../ToolRegistry';
import type { RequestContext, ToolEntry } from '../types';

const context: RequestContext = { requestId: 'request-1' };

function makeEntry(name: string, defer: ToolEntry['defer'], innerTool?: Tool): ToolEntry {
  return {
    defer,
    description: `${name} ${'large schema '.repeat(60)}`,
    name,
    namespace: 'test',
    tool:
      innerTool ??
      tool({
        description: 'x'.repeat(500),
        inputSchema: z.object({ value: z.string() }).strict(),
        execute: async ({ value }) => ({ value }),
      }),
  };
}

describe('deferred tool exposition', () => {
  test('uses always immediately and only auto-defers a sufficiently large pool', () => {
    expect(shouldDefer([makeEntry('always', 'always')], 32_000).deferredNames).toEqual(
      new Set(['always']),
    );
    expect(
      shouldDefer(
        Array.from({ length: 4 }, (_, index) => makeEntry(`auto-${index}`, 'auto')),
        100,
      ).deferredNames.size,
    ).toBe(0);
    expect(
      shouldDefer(
        Array.from({ length: 5 }, (_, index) => makeEntry(`auto-${index}`, 'auto')),
        100,
      ).deferredNames.size,
    ).toBe(5);
  });

  test('injects search, inspect, and invoke only when tools are deferred', () => {
    const registry = new ToolRegistry();
    const inline = makeEntry('inline', 'never');
    const deferred = makeEntry('deferred', 'always');
    registry.register(inline);
    registry.register(deferred);

    const result = applyDeferExposition(
      { inline: inline.tool, deferred: deferred.tool },
      registry,
      32_000,
    );
    expect(Object.keys(result.tools ?? {})).toEqual([
      'inline',
      TOOL_SEARCH_TOOL_NAME,
      TOOL_INSPECT_TOOL_NAME,
      TOOL_INVOKE_TOOL_NAME,
    ]);
    expect(result.tools).not.toHaveProperty('tool_exec');
    expect(result.deferredEntries.map((entry) => entry.name)).toEqual(['deferred']);
  });

  test('limits meta-tool access to deferred names and preserves inner model output', async () => {
    const innerModelOutput = jest.fn(() => ({ type: 'text' as const, value: 'formatted' }));
    const deferredTool = tool({
      inputSchema: z.object({ value: z.string() }).strict(),
      execute: async ({ value }) => ({ value }),
      toModelOutput: innerModelOutput,
    });
    const registry = new ToolRegistry();
    const inline = makeEntry('inline', 'never');
    const deferred = makeEntry('deferred', 'always', deferredTool);
    registry.register(inline);
    registry.register(deferred);
    const tools = applyDeferExposition(
      { inline: inline.tool, deferred: deferred.tool },
      registry,
      32_000,
    ).tools as ToolSet;

    await expect(
      execute(tools[TOOL_INSPECT_TOOL_NAME], { name: 'inline' }, 'inspect-inline'),
    ).rejects.toThrow('not available');
    await execute(tools[TOOL_INSPECT_TOOL_NAME], { name: 'deferred' }, 'inspect-deferred');
    const output = await execute(
      tools[TOOL_INVOKE_TOOL_NAME],
      { name: 'deferred', params: { value: 'ok' } },
      'invoke',
    );
    const modelOutput = tools[TOOL_INVOKE_TOOL_NAME].toModelOutput?.({
      input: { name: 'deferred', params: { value: 'ok' } },
      output,
      toolCallId: 'invoke',
    });
    expect(modelOutput).toEqual({ type: 'text', value: 'formatted' });
    expect(innerModelOutput).toHaveBeenCalledWith(
      expect.objectContaining({ input: { value: 'ok' }, toolCallId: 'invoke::deferred' }),
    );
  });

  test('refuses approval-gated tools at the meta execution boundary', async () => {
    const registry = new ToolRegistry();
    const gated = makeEntry(
      'gated',
      'always',
      tool({
        inputSchema: z.object({}).strict(),
        needsApproval: true,
        execute: async () => 'should not run',
      }),
    );
    registry.register(gated);
    const tools = applyDeferExposition({ gated: gated.tool }, registry, 32_000).tools as ToolSet;
    await execute(tools[TOOL_INSPECT_TOOL_NAME], { name: 'gated' }, 'inspect');
    await expect(
      execute(tools[TOOL_INVOKE_TOOL_NAME], { name: 'gated', params: {} }, 'invoke'),
    ).rejects.toThrow('requires user approval');
  });
});

function execute(selected: Tool | undefined, input: unknown, toolCallId: string) {
  if (!selected?.execute) throw new Error('Missing executable tool');
  return selected.execute(input, {
    experimental_context: context,
    messages: [],
    toolCallId,
  });
}
