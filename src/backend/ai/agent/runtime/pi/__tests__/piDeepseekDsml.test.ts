import type { StreamFn } from '@earendil-works/pi-agent-core';
import { Agent } from '@earendil-works/pi-agent-core/agent';
import type {
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Model,
} from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import type { RuntimeJsonValue, RuntimeTool } from '../../types';
import { withPiDeepseekDsml } from '../piDeepseekDsml';
import { createPiDeferredToolDiscoveryTools } from '../piDeferredToolDiscovery';

const MODEL: Model<'openai-completions'> = {
  api: 'openai-completions',
  provider: 'proxy',
  id: 'deepseek-v4.1-flash',
  name: 'DeepSeek V4.1 Flash',
  baseUrl: 'https://example.test',
  reasoning: true,
  input: ['text'],
  contextWindow: 4096,
  maxTokens: 256,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const CALL =
  '<｜DSML｜tool_calls><｜DSML｜invoke name="Lookup"><｜DSML｜parameter name="query" string="true">notes</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>';
const CONTEXT: Context = {
  messages: [],
  tools: [
    {
      name: 'lookup',
      description: 'Find notes',
      parameters: { type: 'object', properties: { query: { type: 'string' } } } as never,
    },
  ],
};

function message(
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason'] = 'stop',
): AssistantMessage {
  return {
    role: 'assistant',
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    responseId: 'response-1',
    timestamp: 123,
    content,
    stopReason,
    rawStopReason: 'stop',
    usage: {
      input: 12,
      output: 9,
      cacheRead: 3,
      cacheWrite: 0,
      totalTokens: 24,
      cost: { input: 0.1, output: 0.2, cacheRead: 0, cacheWrite: 0, total: 0.3 },
    },
  };
}

function sourceOf(result: AssistantMessage) {
  if (result.stopReason === 'pending') throw new Error('Expected a completed assistant message.');
  const source = new AssistantMessageEventStream();
  source.push({ type: 'start', partial: result });
  result.content.forEach((block, contentIndex) => {
    if (block.type === 'toolCall') {
      source.push({ type: 'toolcall_start', contentIndex, partial: result });
      source.push({
        type: 'toolcall_delta',
        contentIndex,
        delta: JSON.stringify(block.arguments),
        partial: result,
      });
      source.push({ type: 'toolcall_end', contentIndex, toolCall: block, partial: result });
    } else {
      const type = block.type === 'text' ? 'text' : 'thinking';
      const content = block.type === 'text' ? block.text : block.thinking;
      source.push({ type: `${type}_start`, contentIndex, partial: result });
      for (const delta of content)
        source.push({ type: `${type}_delta`, contentIndex, delta, partial: result });
      source.push({ type: `${type}_end`, contentIndex, content, partial: result });
    }
  });
  if (result.stopReason === 'error' || result.stopReason === 'aborted')
    source.push({ type: 'error', reason: result.stopReason, error: result });
  else source.push({ type: 'done', reason: result.stopReason, message: result });
  source.end();
  return source;
}

async function collect(streamFn: StreamFn, options?: Parameters<StreamFn>[2]) {
  const stream = await withPiDeepseekDsml(streamFn)(MODEL, CONTEXT, options);
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result() };
}

describe('Pi DeepSeek DSML adaptation', () => {
  test.each(['text', 'thinking'] as const)(
    'recovers calls from %s in both events and the final message',
    async (type) => {
      const original = message([
        type === 'text'
          ? { type, text: `before ${CALL} after` }
          : { type, thinking: `before ${CALL} after`, thinkingSignature: 'reasoning_content' },
      ]);
      const { events, result } = await collect(() => sourceOf(original));
      expect(result.content).toEqual([
        type === 'text'
          ? { type, text: 'before  after' }
          : { type, thinking: 'before  after', thinkingSignature: 'reasoning_content' },
        {
          type: 'toolCall',
          id: expect.stringMatching(/^dsml_/),
          name: 'lookup',
          arguments: { query: 'notes' },
        },
      ]);
      expect(result).toMatchObject({
        stopReason: 'toolUse',
        usage: original.usage,
        responseId: 'response-1',
        timestamp: 123,
      });
      expect(
        events.filter((event) => event.type === 'toolcall_end').map((event) => event.toolCall),
      ).toEqual([result.content[1]]);
      expect(events.findIndex((event) => event.type === `${type}_end`)).toBeLessThan(
        events.findIndex((event) => event.type === 'toolcall_start'),
      );
      expect(JSON.stringify(events)).not.toContain('DSML');
      expect(JSON.stringify(original)).toContain('DSML');
    },
  );

  test('remaps indices without altering native tool calls, signatures, or later text', async () => {
    const native = {
      type: 'toolCall' as const,
      id: 'native-1',
      name: 'lookup',
      arguments: { query: 'native' },
      thoughtSignature: 'signature',
    };
    const { events, result } = await collect(() =>
      sourceOf(
        message(
          [
            { type: 'text', text: CALL },
            native,
            { type: 'text', text: 'tail', textSignature: 'text-signature' },
          ],
          'toolUse',
        ),
      ),
    );
    expect(result.content[2]).toEqual(native);
    expect(result.content[3]).toEqual({
      type: 'text',
      text: 'tail',
      textSignature: 'text-signature',
    });
    expect(
      events.filter((event) => event.type === 'toolcall_end').map((event) => event.contentIndex),
    ).toEqual([1, 2]);
    expect(
      events.filter((event) => event.type === 'text_end').map((event) => event.contentIndex),
    ).toEqual([0, 3]);
  });

  test('preserves metadata that arrives after the content end', async () => {
    const source = new AssistantMessageEventStream();
    const initial = message([{ type: 'text', text: 'answer' }]);
    source.push({ type: 'start', partial: initial });
    source.push({ type: 'text_start', contentIndex: 0, partial: initial });
    source.push({ type: 'text_delta', contentIndex: 0, delta: 'answer', partial: initial });
    source.push({ type: 'text_end', contentIndex: 0, content: 'answer', partial: initial });
    source.push({
      type: 'done',
      reason: 'stop',
      message: {
        ...initial,
        content: [{ type: 'text', text: 'answer', textSignature: 'late-signature' }],
      },
    });
    expect((await collect(() => source)).result.content).toEqual([
      { type: 'text', text: 'answer', textSignature: 'late-signature' },
    ]);
  });

  test('keeps interleaved text and thinking parsers independent', async () => {
    const result = message([
      { type: 'thinking', thinking: CALL },
      { type: 'text', text: 'visible' },
    ]);
    const source = new AssistantMessageEventStream();
    source.push({ type: 'start', partial: result });
    source.push({ type: 'thinking_start', contentIndex: 0, partial: result });
    source.push({
      type: 'thinking_delta',
      contentIndex: 0,
      delta: CALL.slice(0, 12),
      partial: result,
    });
    source.push({ type: 'text_start', contentIndex: 1, partial: result });
    source.push({ type: 'text_delta', contentIndex: 1, delta: 'visible', partial: result });
    source.push({ type: 'text_end', contentIndex: 1, content: 'visible', partial: result });
    source.push({
      type: 'thinking_delta',
      contentIndex: 0,
      delta: CALL.slice(12),
      partial: result,
    });
    source.push({ type: 'done', reason: 'stop', message: result });
    const normalized = await collect(() => source);
    expect(normalized.result.content).toEqual([
      { type: 'thinking', thinking: '' },
      { type: 'text', text: 'visible' },
      expect.objectContaining({ type: 'toolCall', name: 'lookup', arguments: { query: 'notes' } }),
    ]);
    expect(JSON.stringify(normalized.events)).not.toContain('DSML');
  });

  test('reports malformed and closing-only fragments without exposing them or claiming success', async () => {
    for (const text of [
      CALL.slice(0, -12),
      '</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>',
    ]) {
      const { events, result } = await collect(() =>
        sourceOf(message([{ type: 'thinking', thinking: text }])),
      );
      expect(result).toMatchObject({
        stopReason: 'error',
        diagnostics: [
          expect.objectContaining({
            error: expect.objectContaining({ code: 'deepseek_dsml_parse_error' }),
            details: { retryable: false },
          }),
        ],
      });
      expect(events.at(-1)?.type).toBe('error');
      expect(events.some((event) => event.type === 'toolcall_end')).toBe(false);
      expect(JSON.stringify(result.content)).not.toContain('DSML');
    }
  });

  test('preserves provider failure diagnostics and output limits', async () => {
    const failure = {
      ...message([{ type: 'text', text: 'partial' }], 'error'),
      errorMessage: 'HTTP 429',
      diagnostics: [
        {
          type: 'provider_response_failure',
          timestamp: 1,
          error: { message: 'HTTP 429', code: 'rate_limit' },
        },
      ],
    };
    expect((await collect(() => sourceOf(failure))).result).toEqual(failure);
    expect(
      (await collect(() => sourceOf(message([{ type: 'text', text: CALL }], 'length')))).result
        .stopReason,
    ).toBe('length');
  });

  test('preserves cancellation and resolves the final result even without an event consumer', async () => {
    const controller = new AbortController();
    const source = new AssistantMessageEventStream();
    let forwardedSignal: AbortSignal | undefined;
    const stream = await withPiDeepseekDsml((_model, _context, options) => {
      forwardedSignal = options?.signal;
      return source;
    })(MODEL, CONTEXT, { signal: controller.signal });
    controller.abort();
    source.push({ type: 'done', reason: 'stop', message: message([{ type: 'text', text: CALL }]) });
    expect((await stream.result()).stopReason).toBe('aborted');
    expect(forwardedSignal).toBe(controller.signal);
  });

  test('turns thrown or unterminated provider streams into terminal errors', async () => {
    const thrown = await collect(() => {
      throw new Error('provider failed');
    });
    expect(thrown.result).toMatchObject({ stopReason: 'error', errorMessage: 'provider failed' });
    const source = new AssistantMessageEventStream();
    source.end(message([]));
    expect((await collect(() => source)).result.stopReason).toBe('error');
  });

  test('runs MCP discovery, dispatch, and the follow-up answer through the real Pi agent loop', async () => {
    const executions: RuntimeJsonValue[] = [];
    const target: RuntimeTool = {
      ref: { source: 'mcp', serverId: 'notes', rawToolName: 'save' },
      providerName: 'mcp__notes__save',
      displayName: 'Save note',
      description: 'Save a note',
      inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      approval: 'ask',
      execute: async () => ({ value: 'saved', artifacts: [] }),
    };
    const tools = createPiDeferredToolDiscoveryTools(
      [target],
      async (_tool, input) => {
        executions.push(input);
        return { value: 'saved', artifacts: [] };
      },
      async (_id, _signal, _activity, operation) => operation(32_000).modelOutput,
    );
    const responses = [
      '<｜DSML｜Tool loop><search>save note</search></｜DSML｜Tool>',
      '<｜DSML｜tool_calls><｜DSML｜invoke name="tool_call"><｜DSML｜parameter name="name" string="true">mcp__notes__save</｜DSML｜parameter><｜DSML｜parameter name="params" string="false">{"text":"hello"}</｜DSML｜parameter></｜DSML｜invoke></｜DSML｜tool_calls>',
      'Saved your note.',
    ];
    const requests: Context[] = [];
    const agent = new Agent({
      initialState: { model: MODEL, tools },
      streamFn: withPiDeepseekDsml((_model, context) => {
        requests.push(context);
        const response = responses.shift();
        if (!response) throw new Error('Unexpected additional model request.');
        return sourceOf(message([{ type: 'text', text: response }]));
      }),
    });
    await agent.prompt('Save hello in notes.');
    expect(executions).toEqual([{ text: 'hello' }]);
    expect(requests).toHaveLength(3);
    expect(requests[1].tools?.map((tool) => tool.name)).toEqual([
      'tool_search',
      'tool_describe',
      'tool_call',
    ]);
    expect(agent.state.messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: 'Saved your note.' }],
    });
    expect(agent.state.messages.filter((item) => item.role === 'toolResult')).toHaveLength(2);
    expect(JSON.stringify(agent.state.messages)).not.toContain('DSML');
  });

  test.each(['error', 'length'] as const)(
    'never executes recovered calls from a %s turn',
    async (reason) => {
      const executed: string[] = [];
      const agent = new Agent({
        initialState: {
          model: MODEL,
          tools: [
            {
              ...CONTEXT.tools![0],
              label: 'Lookup',
              execute: async () => {
                executed.push('lookup');
                return { content: [{ type: 'text', text: 'done' }], details: {} };
              },
            },
          ],
        },
        shouldStopAfterTurn: async () => true,
        streamFn: withPiDeepseekDsml(() =>
          sourceOf(
            message(
              [{ type: 'text', text: reason === 'error' ? `${CALL}<｜DSML｜tool_calls>` : CALL }],
              reason === 'error' ? 'stop' : 'length',
            ),
          ),
        ),
      });
      await agent.prompt('Find notes.');
      expect(executed).toEqual([]);
    },
  );
});
