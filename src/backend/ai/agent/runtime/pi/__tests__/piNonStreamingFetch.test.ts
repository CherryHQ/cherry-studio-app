import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type {
  AssistantMessageEvent,
  FetchFunction,
  Model,
  StreamOptions,
} from '@earendil-works/pi-ai';
import { isRetryableAssistantError } from '@earendil-works/pi-ai/utils/retry';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import { bindPiStream, resolvePiApiAdapter } from '../piApiAdapters';
import { withPiApiKeyFallback } from '../piApiKeyFallback';
import { piModelTerminalErrorAttributes } from '../piModelDiagnostics';
import { readPiTerminalError } from '../piModelError';
import type { PiStreamFn } from '../piModelTypes';
import {
  assertPiNonStreamingSupported,
  createPiNonStreamingFetch,
  PiNonStreamingResponseError,
  PiNonStreamingUnsupportedError,
} from '../piNonStreamingFetch';
import { emptyAssistantMessage, providerErrorEvent } from '../piStreamEvents';
import { withPiStreamIdleTimeout } from '../piStreamIdleTimeout';
import { streamVertexAnthropic } from '../piVertexAnthropic';
import { PiWebResponse, readPiWebResult } from '../PiWebResponse';

type Api = Parameters<typeof createPiNonStreamingFetch>[0];
type ProviderStream = (
  model: Model<Api>,
  context: ReturnType<typeof normalizeContext>,
  options: StreamOptions,
) => AsyncIterable<AssistantMessageEvent>;

const OPENAI_APIS = ['openai-completions', 'openai-responses', 'azure-openai-responses'] as const;
const NEW_APIS = ['anthropic-messages', 'google-generative-ai', 'google-vertex'] as const;
const APIS: Exclude<Api, 'openai-codex-responses'>[] = [...OPENAI_APIS, ...NEW_APIS];
// Provider SSE fixtures are independent of the finite adapter under test.
const COMPLETION_SSE = `data: {"id":"baseline","choices":[{"index":0,"delta":{"role":"assistant","content":"Baseline answer"}}]}

data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"lookup","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}

data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}

data: [DONE]

`;
const RESPONSE_SSE = `event: response.created
data: {"type":"response.created","response":{"id":"baseline","status":"in_progress","output":[]}}

event: response.output_item.added
data: {"type":"response.output_item.added","output_index":0,"item":{"id":"msg-1","type":"message","role":"assistant","content":[]}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"Baseline answer"}

event: response.output_item.done
data: {"type":"response.output_item.done","output_index":0,"item":{"id":"msg-1","type":"message","role":"assistant","content":[{"type":"output_text","text":"Baseline answer","annotations":[]}]}}

event: response.output_item.added
data: {"type":"response.output_item.added","output_index":1,"item":{"id":"fc-1","type":"function_call","call_id":"call-1","name":"lookup","arguments":""}}

event: response.function_call_arguments.delta
data: {"type":"response.function_call_arguments.delta","output_index":1,"delta":"{}"}

event: response.output_item.done
data: {"type":"response.output_item.done","output_index":1,"item":{"id":"fc-1","type":"function_call","call_id":"call-1","name":"lookup","arguments":"{}"}}

event: response.completed
data: {"type":"response.completed","response":{"id":"baseline","status":"completed","usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}}

`;
const ANTHROPIC_SSE = `event: message_start
data: {"type":"message_start","message":{"id":"baseline","type":"message","role":"assistant","model":"test-model","content":[],"usage":{"input_tokens":3,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Baseline answer"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call-1","name":"lookup","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":2}}

event: message_stop
data: {"type":"message_stop"}

`;
const GOOGLE_SSE = `data: {"responseId":"baseline","candidates":[{"content":{"role":"model","parts":[{"text":"Baseline answer"},{"functionCall":{"id":"call-1","name":"lookup","args":{}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2,"totalTokenCount":5}}

`;
const STREAMING_FIXTURES = {
  'openai-completions': COMPLETION_SSE,
  'openai-responses': RESPONSE_SSE,
  'azure-openai-responses': RESPONSE_SSE,
  'anthropic-messages': ANTHROPIC_SSE,
  'google-generative-ai': GOOGLE_SSE,
  'google-vertex': GOOGLE_SSE,
};
const PARSERS: Record<Api, ProviderStream> = {
  'openai-codex-responses': jest.requireActual('@earendil-works/pi-ai/api/openai-codex-responses')
    .stream,
  'anthropic-messages': jest.requireActual('@earendil-works/pi-ai/api/anthropic-messages').stream,
  'google-generative-ai': jest.requireActual('@earendil-works/pi-ai/api/google-generative-ai')
    .stream,
  // Jest cannot load the host-token client's dynamic ESM import. Exercise the real Vertex
  // API-key client/parser here; piVertexNative.test.ts covers the Web host-token client.
  'google-vertex': async function* (model, context, options) {
    const transport = jest.spyOn(globalThis, 'fetch').mockImplementation(options.fetch!);
    try {
      yield* jest
        .requireActual('@earendil-works/pi-ai/api/google-vertex')
        .stream(model, context, { ...options, fetch: undefined });
    } finally {
      transport.mockRestore();
    }
  },
  'openai-completions': jest.requireActual('@earendil-works/pi-ai/api/openai-completions').stream,
  'openai-responses': jest.requireActual('@earendil-works/pi-ai/api/openai-responses').stream,
  'azure-openai-responses': jest.requireActual('@earendil-works/pi-ai/api/azure-openai-responses')
    .stream,
};
const REASONING_DETAILS = [
  { type: 'reasoning.text', text: '思考', signature: 'signed', index: 0 },
  { type: 'reasoning.encrypted', id: 'encrypted', data: 'opaque', format: 'provider', index: 1 },
];
const COMPLETION = {
  id: 'chat-1',
  model: 'actual-model',
  object: 'chat.completion',
  created: 123,
  provider_extra: { native: true },
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: '你好 🌸',
        reasoning_content: '思考',
        reasoning_details: REASONING_DETAILS,
        server_tool_calls: [{ id: 'search', type: 'web_search', result: ['source'] }],
        tool_calls: [
          {
            id: 'call-a',
            type: 'function',
            function: { name: 'lookup', arguments: '{"city":"北京"}' },
            extra_content: { google: { thought_signature: 'google-signed' } },
          },
          { id: 'call-b', type: 'function', function: { name: 'other', arguments: '{"count":2}' } },
        ],
      },
      finish_reason: 'tool_calls',
      logprobs: { extra: true },
    },
  ],
  usage: {
    prompt_tokens: 20,
    completion_tokens: 10,
    total_tokens: 30,
    prompt_tokens_details: { cached_tokens: 3 },
    completion_tokens_details: { reasoning_tokens: 4 },
  },
};
const RESPONSE = {
  id: 'resp-1',
  model: 'actual-model',
  object: 'response',
  created_at: 123,
  status: 'completed',
  provider_extra: { native: true },
  output: [
    {
      type: 'reasoning',
      id: 'rs-1',
      summary: [{ type: 'summary_text', text: '思考' }],
      encrypted_content: 'encrypted-opaque',
      provider_extra: 'reasoning',
    },
    {
      type: 'web_search_call',
      id: 'web-1',
      status: 'completed',
      action: { type: 'search', query: 'weather', sources: [{ url: 'https://source.test' }] },
    },
    {
      type: 'message',
      id: 'msg-1',
      role: 'assistant',
      phase: 'final_answer',
      status: 'completed',
      content: [
        {
          type: 'output_text',
          text: '你好 🌸',
          annotations: [
            {
              type: 'url_citation',
              url: 'https://source.test',
              title: 'Source',
              start_index: 0,
              end_index: 2,
            },
          ],
        },
      ],
    },
    {
      type: 'function_call',
      id: 'fc-1',
      call_id: 'call-a',
      name: 'lookup',
      namespace: 'weather',
      arguments: '{"city":"北京"}',
      status: 'completed',
      provider_extra: 'tool',
    },
    {
      type: 'function_call',
      id: 'fc-2',
      call_id: 'call-b',
      name: 'other',
      arguments: '{"count":2}',
      status: 'completed',
    },
  ],
  usage: {
    input_tokens: 20,
    output_tokens: 10,
    total_tokens: 30,
    input_tokens_details: { cached_tokens: 3 },
    output_tokens_details: { reasoning_tokens: 4 },
  },
};

const ANTHROPIC = {
  id: 'msg-finite',
  type: 'message',
  role: 'assistant',
  model: 'actual-model',
  content: [
    { type: 'thinking', thinking: '思考', signature: 'thinking-signed' },
    { type: 'redacted_thinking', data: 'redacted-signed', signature: 'native-redacted-signature' },
    { type: 'server_tool_use', id: 'search', name: 'web_search', input: { query: 'weather' } },
    {
      type: 'web_search_tool_result',
      tool_use_id: 'search',
      content: [
        {
          type: 'web_search_result',
          url: 'https://source.test',
          title: 'Source',
          encrypted_content: 'opaque',
          page_age: 'today',
        },
      ],
    },
    {
      type: 'text',
      text: '你好 🌸',
      citations: [
        {
          type: 'web_search_result_location',
          url: 'https://source.test',
          title: 'Source',
          encrypted_index: 'citation-signed',
          cited_text: '你好',
        },
      ],
    },
    { type: 'tool_use', id: 'call-a', name: 'lookup', input: { city: '北京' } },
  ],
  stop_reason: 'tool_use',
  stop_sequence: 'END',
  usage: {
    input_tokens: 20,
    output_tokens: 10,
    cache_read_input_tokens: 3,
    cache_creation_input_tokens: 2,
    output_tokens_details: { thinking_tokens: 4 },
  },
};
const GOOGLE = {
  responseId: 'google-finite',
  modelVersion: 'actual-model',
  candidates: [
    {
      content: {
        role: 'model',
        parts: [
          { text: '思考', thought: true, thoughtSignature: 'thinking-signed' },
          { text: '你好 🌸', thoughtSignature: 'text-signed' },
          {
            functionCall: { id: 'call-a', name: 'lookup', args: { city: '北京' } },
            thoughtSignature: 'tool-signed',
          },
          {
            toolCall: { id: 'native-call', toolType: 'GOOGLE_SEARCH', args: { query: 'weather' } },
            thoughtSignature: 'native-tool-signed',
          },
          {
            toolResponse: {
              id: 'native-call',
              toolType: 'GOOGLE_SEARCH',
              response: { result: 'source' },
            },
          },
          { executableCode: { language: 'PYTHON', code: 'print(1)' } },
          { codeExecutionResult: { outcome: 'OUTCOME_OK', output: '1' } },
        ],
      },
      finishReason: 'STOP',
      groundingMetadata: {
        groundingChunks: [{ web: { uri: 'https://source.test', title: 'Source' } }],
        groundingSupports: [
          { segment: { startIndex: 0, endIndex: 2, text: '你好' }, groundingChunkIndices: [0] },
        ],
      },
    },
  ],
  usageMetadata: {
    promptTokenCount: 20,
    candidatesTokenCount: 6,
    thoughtsTokenCount: 4,
    cachedContentTokenCount: 3,
    totalTokenCount: 30,
  },
};

function fixture(api: Api) {
  if (api === 'anthropic-messages') return ANTHROPIC;
  if (api === 'google-generative-ai' || api === 'google-vertex') return GOOGLE;
  return api === 'openai-completions' ? COMPLETION : RESPONSE;
}
function model(api: Api): Model<Api> {
  return {
    api,
    provider: 'test',
    id: 'test-model',
    name: 'Test',
    baseUrl: 'https://provider.test/prefix/v1',
    reasoning: true,
    input: ['text'],
    contextWindow: 4096,
    maxTokens: 256,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}
function bindingAdapter(api: Api) {
  const endpoint =
    api === 'anthropic-messages'
      ? ENDPOINT_TYPE.ANTHROPIC_MESSAGES
      : api.startsWith('google')
        ? ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT
        : api === 'openai-completions'
          ? ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS
          : ENDPOINT_TYPE.OPENAI_RESPONSES;
  return resolvePiApiAdapter(
    endpoint,
    api === 'google-vertex'
      ? 'google-vertex'
      : api === 'azure-openai-responses'
        ? 'azure-responses'
        : undefined,
  );
}

function controlledResponse(options: ResponseInit = {}) {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const cancel = jest.fn();
  const pull = jest.fn();
  const body = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
      },
      pull,
      cancel,
    },
    { highWaterMark: 0 },
  );
  const response = new Response(null, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  Object.defineProperty(response, 'body', { value: body, configurable: true });
  return {
    response,
    cancel,
    pull,
    write: (value: string | Uint8Array) =>
      controller.enqueue(typeof value === 'string' ? new TextEncoder().encode(value) : value),
    close: () => controller.close(),
    fail: (error: unknown) => controller.error(error),
  };
}
function finiteResponse(value: unknown, options?: ResponseInit) {
  const source = controlledResponse(options);
  source.write(JSON.stringify(value));
  source.close();
  return source.response;
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
async function collect(
  api: Api,
  fetch: FetchFunction,
  options: Partial<StreamOptions> = {},
  piModel = model(api),
  parser = PARSERS[api],
) {
  const events: AssistantMessageEvent[] = [];
  for await (const event of parser(
    piModel,
    normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
    {
      apiKey: 'test-key',
      maxRetries: 0,
      fetch,
      ...options,
    },
  ))
    events.push(event);
  const terminal = events.at(-1)!;
  expect(['done', 'error']).toContain(terminal.type);
  return {
    events,
    message: (terminal.type === 'done'
      ? terminal.message
      : terminal.type === 'error'
        ? terminal.error
        : undefined)!,
  };
}
async function readBody(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return result + decoder.decode();
    result += decoder.decode(value, { stream: true });
  }
}
const init = { method: 'POST', body: '{"stream":true,"stream_options":{"include_usage":true}}' };

// These use the installed SDK request builder and parser, with only the transport replaced.
describe('Pi finite fetch', () => {
  test.each([null, undefined, '', []])(
    'completions displays refusal with empty content %j through the installed parser',
    async (content) => {
      const wire: unknown[] = [];
      const { message } = await collect(
        'openai-completions',
        createPiNonStreamingFetch('openai-completions', async () =>
          finiteResponse({
            choices: [{ message: { content, refusal: 'Declined' }, finish_reason: 'stop' }],
          }),
        ),
        {
          onProviderStreamEvent: (event) => {
            wire.push(event);
          },
        },
      );
      expect(message).toMatchObject({
        stopReason: 'stop',
        content: [{ type: 'text', text: 'Declined' }],
      });
      expect(wire[0]).toMatchObject({
        choices: [{ delta: { content: 'Declined', refusal: 'Declined' } }],
      });
    },
  );

  test.each([
    {},
    { content: '' },
    { content: [] },
    { reasoning: '', refusal: '', tool_calls: [], reasoning_details: [] },
  ])(
    'completions rejects a message without a terminal reason or supported payload: %j',
    async (payload) => {
      const response = await createPiNonStreamingFetch('openai-completions', async () =>
        finiteResponse({ choices: [{ message: payload }] }),
      )('https://provider.test', init);
      await expect(readBody(response)).rejects.toMatchObject({
        name: 'PiNonStreamingResponseError',
        reason: 'invalid_response',
      });
      const { message } = await collect(
        'openai-completions',
        createPiNonStreamingFetch('openai-completions', async () =>
          finiteResponse({ choices: [{ message: payload }] }),
        ),
        {},
        { ...model('openai-completions'), compat: { supportsFinishReason: false } },
      );
      expect(message).toMatchObject({ stopReason: 'error', content: [] });
      expect(readPiTerminalError(message)).toMatchObject({
        code: 'non_streaming_response_invalid',
        retryable: false,
      });
    },
  );

  test.each([
    { content: 'Answer' },
    { content: [{ type: 'text', text: 'Answer' }] },
    { reasoning: 'Reason' },
    { reasoning_details: REASONING_DETAILS },
    { refusal: 'Declined' },
    {
      tool_calls: [{ id: 'call', type: 'function', function: { name: 'lookup', arguments: '{}' } }],
    },
    { tool_calls: [{ id: 'call', type: 'custom', custom: { name: 'lookup', input: 'query' } }] },
  ])('completions accepts supported payload without finish_reason: %j', async (payload) => {
    const { message } = await collect(
      'openai-completions',
      createPiNonStreamingFetch('openai-completions', async () =>
        finiteResponse({ choices: [{ message: payload }] }),
      ),
      {},
      { ...model('openai-completions'), compat: { supportsFinishReason: false } },
    );
    expect(['stop', 'toolUse']).toContain(message.stopReason);
    expect(message.content.length).toBeGreaterThan(0);
  });

  test.each(['google-generative-ai', 'google-vertex'] as const)(
    '%s preserves prompt safety feedback and usage through the installed parser',
    async (api) => {
      for (const reason of ['SAFETY', 'RECITATION']) {
        const value = {
          promptFeedback: {
            blockReason: reason,
            safetyRatings: [{ category: 'HARM_CATEGORY_DANGEROUS_CONTENT', probability: 'HIGH' }],
          },
          usageMetadata: GOOGLE.usageMetadata,
        };
        const wire: unknown[] = [];
        const { message } = await collect(
          api,
          createPiNonStreamingFetch(api, async () => finiteResponse(value)),
          {
            onProviderStreamEvent: (event) => {
              wire.push(event);
            },
          },
        );
        expect(message).toMatchObject({
          stopReason: 'error',
          rawStopReason: reason,
          errorMessage: `Provider stopped with: ${reason}`,
          content: [],
          usage: { input: 17, output: 10, cacheRead: 3, reasoning: 4, totalTokens: 30 },
        });
        expect(wire).toEqual([
          expect.objectContaining({
            ...value,
            candidates: [{ finishReason: reason, content: { role: 'model', parts: [] } }],
          }),
        ]);
        expect(message.diagnostics?.at(-1)?.error?.code).not.toBe('non_streaming_response_invalid');
      }
    },
  );

  test.each(['google-generative-ai', 'google-vertex'] as const)(
    '%s preserves terminal safety candidates whose content has no parts',
    async (api) => {
      const { message } = await collect(
        api,
        createPiNonStreamingFetch(api, async () =>
          finiteResponse({
            candidates: [{ finishReason: 'SAFETY', content: { role: 'model' } }],
            usageMetadata: GOOGLE.usageMetadata,
          }),
        ),
      );
      expect(message).toMatchObject({
        stopReason: 'error',
        rawStopReason: 'SAFETY',
        errorMessage: 'Provider stopped with: SAFETY',
        content: [],
        usage: { totalTokens: 30 },
      });
    },
  );

  test.each(['non_streaming_response_invalid', 'non_streaming_mode_unsupported'])(
    'streaming HTTP 429 with provider code %s remains user-retryable',
    async (code) => {
      const { message } = await collect(
        'openai-completions',
        async () =>
          new Response(JSON.stringify({ error: { code, message: 'Too many requests' } }), {
            status: 429,
            headers: { 'content-type': 'application/json' },
          }),
      );
      expect(message.stopReason).toBe('error');
      expect(readPiTerminalError(message)).toMatchObject({ code, retryable: true });
    },
  );

  test.each(['consume', 'cancel', 'read failure', 'abort'] as const)(
    'non-2xx %s releases abort links after keeping cancellation active during reads',
    async (outcome) => {
      const caller = new AbortController();
      const add = jest.spyOn(caller.signal, 'addEventListener');
      const remove = jest.spyOn(caller.signal, 'removeEventListener');
      for (let index = 0; index < (outcome === 'abort' ? 1 : 3); index++) {
        const source = controlledResponse({ status: 401 });
        let signal!: AbortSignal;
        const response = await createPiNonStreamingFetch(
          'openai-completions',
          async (_input, options) => {
            signal = options!.signal!;
            return source.response;
          },
        )('https://provider.test', { ...init, signal: caller.signal });
        expect(add.mock.calls.length - remove.mock.calls.length).toBe(1);
        if (outcome === 'cancel') await response.body!.cancel();
        else if (outcome === 'abort') {
          const reading = readBody(response);
          caller.abort(new Error('Cancelled error body'));
          expect(signal.aborted).toBe(true);
          await expect(reading).rejects.toThrow('Cancelled error body');
          expect(source.cancel).toHaveBeenCalledTimes(1);
        } else if (outcome === 'read failure') {
          source.fail(new Error('Error body failed'));
          await expect(readBody(response)).rejects.toThrow('Error body failed');
        } else {
          const reading = readBody(response);
          source.write('Unauthorized');
          await flush();
          expect(add.mock.calls.length - remove.mock.calls.length).toBe(1);
          source.close();
          expect(await reading).toBe('Unauthorized');
        }
        expect(add.mock.calls.length - remove.mock.calls.length).toBe(0);
        expect(remove.mock.calls.at(-1)?.[1]).toBe(add.mock.calls.at(-1)?.[1]);
      }
    },
  );

  test.each(APIS)(
    '%s finite binding waits for EOF and then emits the whole answer',
    async (api) => {
      const adapter = bindingAdapter(api);
      const source = controlledResponse();
      const fetch = jest.fn(async (_input: unknown, _init?: RequestInit) => source.response);
      const stream = await bindPiStream(
        { ...adapter, loadStreamSimple: async () => PARSERS[api] as PiStreamFn },
        {
          shouldStream: false,
          apiKey: 'key',
          fetch,
          headers: {},
          maxRetries: 0,
          maxTokens: 256,
        },
      );
      const events: AssistantMessageEvent[] = [];
      const run = (async () => {
        for await (const event of await stream(
          {
            ...model(api),
            ...(api === 'openai-completions' ? { compat: { supportsFinishReason: false } } : {}),
          },
          normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
        ))
          events.push(event);
      })();
      const json = JSON.stringify(fixture(api));
      source.write(json.slice(0, -10));
      await flush();
      expect(source.pull).toHaveBeenCalled();
      expect(events.filter((event) => event.type !== 'start')).toEqual([]);
      source.write(json.slice(-10));
      await flush();
      expect(events.filter((event) => event.type !== 'start')).toEqual([]);
      source.close();
      await run;
      expect(
        events.filter((event) => event.type === 'text_delta').map((event) => event.delta),
      ).toEqual(['你好 🌸']);
      expect(events.at(-1)?.type).toBe('done');
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = fetch.mock.calls[0];
      if (api.startsWith('google')) {
        expect(String(url)).toContain(':generateContent');
        expect(String(url)).not.toContain('alt=sse');
      } else {
        expect(JSON.parse(String(init?.body))).toMatchObject({ stream: false });
        expect(JSON.parse(String(init?.body))).not.toHaveProperty('stream_options');
      }
    },
  );

  test.each(APIS)(
    '%s streaming binding preserves request bytes and provider events',
    async (api) => {
      const adapter = bindingAdapter(api);
      const capture = async (bound: boolean) => {
        const fetch = jest.fn(async (_input: unknown, _init?: RequestInit) => {
          return new Response(STREAMING_FIXTURES[api], {
            headers: { 'content-type': 'text/event-stream' },
          });
        });
        const options = { apiKey: 'key', fetch, maxRetries: 0, maxTokens: 256 };
        const parser = PARSERS[api];
        const stream = bound
          ? await bindPiStream(
              { ...adapter, loadStreamSimple: async () => parser as PiStreamFn },
              { ...options, shouldStream: true, headers: {} },
            )
          : parser;
        const events: AssistantMessageEvent[] = [];
        for await (const event of await stream(
          model(api),
          normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
          options,
        ))
          events.push(event);
        return { fetch, events };
      };
      const baseline = await capture(false);
      const bound = await capture(true);
      expect(bound.fetch.mock.calls[0][1]?.body).toBe(baseline.fetch.mock.calls[0][1]?.body);
      expect(bound.fetch.mock.calls[0][0]).toEqual(baseline.fetch.mock.calls[0][0]);
      expect(new Headers(bound.fetch.mock.calls[0][1]?.headers)).toEqual(
        new Headers(baseline.fetch.mock.calls[0][1]?.headers),
      );
      expect(bound.events.map((event) => event.type)).toEqual(
        baseline.events.map((event) => event.type),
      );
      expect(bound.events.at(-1)?.type).toBe('done');
      const terminal = bound.events.at(-1);
      const previous = baseline.events.at(-1);
      if (terminal?.type === 'done' && previous?.type === 'done') {
        expect(terminal.message.content).toEqual(previous.message.content);
        expect(terminal.message.usage).toEqual(previous.message.usage);
        expect(terminal.message.content).toContainEqual(
          expect.objectContaining({ type: 'text', text: 'Baseline answer' }),
        );
        expect(terminal.message.content.filter((part) => part.type === 'toolCall')).toHaveLength(1);
        expect(terminal.message.usage.totalTokens).toBe(5);
      }
      expect(bound.fetch).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    {
      name: 'Codex',
      adapter: resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_RESPONSES, 'openai-codex'),
    },
    {
      name: 'transport without custom fetch',
      adapter: { ...bindingAdapter('openai-responses'), supportsCustomFetch: false },
    },
  ])(
    '$name finite binding rejects before loading its parser or dispatching',
    async ({ adapter }) => {
      const loadStreamSimple = jest.fn(adapter.loadStreamSimple);
      const fetch = jest.fn();
      await expect(
        bindPiStream(
          { ...adapter, loadStreamSimple },
          {
            shouldStream: false,
            apiKey: 'key',
            fetch,
            headers: {},
            maxRetries: 0,
            maxTokens: 256,
          },
        ),
      ).rejects.toMatchObject({ code: 'non_streaming_mode_unsupported', retryable: false });
      expect(loadStreamSimple).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  test('finite protocol errors remain terminal through the real binding', async () => {
    const fetch = jest.fn(async () => finiteResponse({ choices: [] }));
    const stream = await bindPiStream(
      {
        ...resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS),
        loadStreamSimple: async () =>
          jest.requireActual('@earendil-works/pi-ai/api/openai-completions').streamSimple,
      },
      {
        shouldStream: false,
        apiKey: 'key',
        fetch,
        headers: {},
        maxRetries: 0,
        maxTokens: 256,
      },
    );
    const result = await (
      await stream(model('openai-completions'), normalizeContext({ messages: [] }))
    ).result();
    expect(isRetryableAssistantError(result)).toBe(false);
    expect(readPiTerminalError(result)).toMatchObject({
      code: 'non_streaming_response_invalid',
      retryable: false,
    });
    expect(result.diagnostics?.at(-1)).toMatchObject({
      error: { code: 'non_streaming_response_invalid' },
      details: { retryable: false },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each(OPENAI_APIS)(
    '%s rewrites only the streaming body fields, preserving the SDK URL and auth',
    async (api) => {
      const capture = async (adapt: boolean) => {
        let captured:
          | { url: unknown; init: RequestInit; body: Record<string, unknown> }
          | undefined;
        const fetch: FetchFunction = async (url, request) => {
          captured = { url, init: request!, body: JSON.parse(String(request?.body)) };
          return new Response('{"error":{"message":"captured"}}', {
            status: 400,
            headers: { 'content-type': 'application/json' },
          });
        };
        await collect(api, adapt ? createPiNonStreamingFetch(api, fetch) : fetch, {
          headers: { 'x-custom': 'keep', authorization: 'Bearer custom-auth' },
          onPayload: (payload) => ({
            ...(payload as object),
            stream_options: { include_usage: true },
            provider_option: { unchanged: ['x', 3] },
          }),
        });
        return captured!;
      };
      const baseline = await capture(false);
      const finite = await capture(true);
      expect(baseline.body.stream).toBe(true);
      const { stream_options: _streamOptions, ...expected } = baseline.body;
      expect(finite.body).toEqual({ ...expected, stream: false });
      expect(finite.url).toEqual(baseline.url);
      expect(new Headers(finite.init.headers)).toEqual(new Headers(baseline.init.headers));
      expect(finite.init.method).toEqual(baseline.init.method);
      expect(String(finite.url)).toContain('/prefix/v1/');
      if (api === 'azure-openai-responses') {
        expect(String(finite.url)).toContain('/responses?api-version=v1');
        expect(new Headers(finite.init.headers).get('api-key')).toBe('test-key');
      } else
        expect(new Headers(finite.init.headers).get('authorization')).toBe('Bearer custom-auth');
    },
  );

  test.each(OPENAI_APIS)(
    '%s passes custom deployment, query, request options and headers untouched',
    async (api) => {
      const fetch = jest.fn(async () => new Response(null, { status: 204 }));
      const url =
        'https://azure.test/proxy/openai/deployments/custom/responses?api-version=2026-01-01&other=keep';
      const headers = { authorization: 'Bearer key', 'api-key': 'azure-key' };
      const body = {
        model: 'x',
        input: [],
        messages: [],
        stream: true,
        stream_options: { include_usage: true },
        temperature: 0.5,
        tools: [{ type: 'function', function: { name: 'lookup' } }],
        include: ['reasoning.encrypted_content'],
        metadata: { keep: 'yes' },
      };
      await createPiNonStreamingFetch(api, fetch)(url, {
        method: 'POST',
        headers,
        credentials: 'omit',
        body: JSON.stringify(body),
      });
      const [actualUrl, actualInit] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      const { stream_options: _options, ...expected } = body;
      expect(actualUrl).toBe(url);
      expect(actualInit.headers).toBe(headers);
      expect(actualInit.credentials).toBe('omit');
      expect(JSON.parse(String(actualInit.body))).toEqual({ ...expected, stream: false });
    },
  );

  test.each(NEW_APIS)(
    '%s rewrites the SDK operation and preserves auth and finite JSON body',
    async (api) => {
      const capture = async (adapt: boolean) => {
        let captured!: { url: string; init: RequestInit; body: string };
        const fetch: FetchFunction = async (url, request) => {
          captured = { url: String(url), init: request!, body: String(request?.body) };
          return new Response('{"error":{"message":"captured"}}', { status: 400 });
        };
        await collect(api, adapt ? createPiNonStreamingFetch(api, fetch) : fetch, {
          headers: { 'x-custom': 'keep', authorization: 'Bearer custom-auth' },
        });
        return captured;
      };
      const baseline = await capture(false);
      const finite = await capture(true);
      expect(new Headers(finite.init.headers)).toEqual(new Headers(baseline.init.headers));
      expect(new Headers(finite.init.headers).get('x-custom')).toBe('keep');
      expect(finite.init.method).toBe(baseline.init.method);
      if (api === 'anthropic-messages') {
        expect(finite.url).toBe('https://provider.test/prefix/v1/v1/messages?beta=true');
        expect(new Headers(finite.init.headers).get('x-api-key')).toBe('test-key');
        expect(JSON.parse(finite.body)).toEqual({ ...JSON.parse(baseline.body), stream: false });
      } else {
        expect(baseline.url).toContain(':streamGenerateContent?alt=sse');
        expect(finite.url).toBe(
          baseline.url.replace(':streamGenerateContent?alt=sse', ':generateContent'),
        );
        expect(finite.url).toBe(
          `https://provider.test/prefix/v1/${api === 'google-vertex' ? 'publishers/google/' : ''}models/test-model:generateContent`,
        );
        expect(new Headers(finite.init.headers).get('x-goog-api-key')).toBe('test-key');
        expect(finite.body).toBe(baseline.body);
        expect(JSON.parse(finite.body)).not.toHaveProperty('stream');
      }
    },
  );

  test('Vertex Anthropic swaps streamRawPredict to rawPredict with the installed Vertex SDK and Pi parser', async () => {
    let captured!: { url: string; headers: Headers; body: Record<string, unknown> };
    const fetch: FetchFunction = async (url, request) => {
      captured = {
        url: String(url),
        headers: new Headers(request?.headers),
        body: JSON.parse(String(request?.body)),
      };
      return finiteResponse(ANTHROPIC);
    };
    const { message, events } = await collect(
      'anthropic-messages',
      createPiNonStreamingFetch('anthropic-messages', fetch),
      {
        ...{ accessToken: 'host-token', vertex: { projectId: 'project-id', location: 'us-east5' } },
        headers: { 'x-custom': 'keep' },
      },
      model('anthropic-messages'),
      streamVertexAnthropic as ProviderStream,
    );
    expect(captured.url).toBe(
      'https://provider.test/prefix/v1/projects/project-id/locations/us-east5/publishers/anthropic/models/test-model:rawPredict',
    );
    expect(captured.headers.get('authorization')).toBe('Bearer host-token');
    expect(captured.headers.get('x-custom')).toBe('keep');
    expect(captured.body).toMatchObject({ stream: false, anthropic_version: 'vertex-2023-10-16' });
    expect(captured.body).not.toHaveProperty('model');
    expect(events.at(-1)?.type).toBe('done');
    expect(message.content).toContainEqual({
      type: 'toolCall',
      id: 'call-a',
      name: 'lookup',
      arguments: { city: '北京' },
    });
  });

  test.each(NEW_APIS)(
    '%s preserves custom queries, headers, options and request bodies',
    async (api) => {
      const fetch = jest.fn(async () => new Response(null, { status: 204 }));
      const operation = api === 'anthropic-messages' ? 'streamRawPredict' : 'streamGenerateContent';
      const finiteOperation = api === 'anthropic-messages' ? 'rawPredict' : 'generateContent';
      const url = `https://gateway.test/custom/models/deployment:${operation}?key=keep&alt=sse&other=keep`;
      const headers = { authorization: 'Bearer host-token', 'x-custom': 'keep' };
      const body = '{ "contents": [], "stream": true, "provider_option": {"keep": 1} }';
      await createPiNonStreamingFetch(api, fetch)(url, {
        method: 'POST',
        headers,
        credentials: 'omit',
        body,
      });
      const [actualUrl, actualInit] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(actualUrl).toBe(
        `https://gateway.test/custom/models/deployment:${finiteOperation}?key=keep&${api === 'anthropic-messages' ? 'alt=sse&' : ''}other=keep`,
      );
      expect(actualInit.headers).toBe(headers);
      expect(actualInit.credentials).toBe('omit');
      expect(actualInit.body).toBe(
        api === 'anthropic-messages'
          ? JSON.stringify({ ...JSON.parse(body), stream: false })
          : body,
      );
    },
  );

  test.each(NEW_APIS)(
    '%s preserves Request-owned method, auth, body and cancellation',
    async (api) => {
      const caller = new AbortController();
      const isAnthropic = api === 'anthropic-messages';
      const url = `https://gateway.test/models/m:${isAnthropic ? 'streamRawPredict' : 'streamGenerateContent'}?alt=sse&keep=yes`;
      const body = '{ "contents": [], "stream": true }';
      const request = new Request(url, {
        method: 'POST',
        headers: { authorization: 'Bearer request-token' },
        body,
        signal: caller.signal,
      });
      let target!: Request;
      let options!: RequestInit;
      const response = await createPiNonStreamingFetch(api, async (input, init) => {
        target = input as Request;
        options = init!;
        return finiteResponse(fixture(api));
      })(request);
      expect(target.url).toBe(
        `https://gateway.test/models/m:${isAnthropic ? 'rawPredict?alt=sse&keep=yes' : 'generateContent?keep=yes'}`,
      );
      expect(target.method).toBe('POST');
      expect(target.headers.get('authorization')).toBe('Bearer request-token');
      expect(options.body).toBe(isAnthropic ? '{"contents":[],"stream":false}' : body);
      caller.abort(new Error('request-owned abort'));
      await expect(response.body!.getReader().read()).rejects.toThrow('request-owned abort');
      expect(options.signal?.aborted).toBe(true);
    },
  );

  test('Anthropic preserves ordered blocks, signatures, tool input once, citations, stop sequence and usage', async () => {
    const wire: Record<string, unknown>[] = [];
    const web = new PiWebResponse('finite', 'anthropic');
    const { message, events } = await collect(
      'anthropic-messages',
      createPiNonStreamingFetch('anthropic-messages', async () => finiteResponse(ANTHROPIC)),
      {
        onProviderStreamEvent: (event) => {
          wire.push(event as Record<string, unknown>);
          web.observe(event);
        },
      },
    );
    expect(events.at(-1)?.type).toBe('done');
    expect(message).toMatchObject({
      stopReason: 'toolUse',
      rawStopReason: 'tool_use',
      responseId: 'msg-finite',
      responseModel: 'actual-model',
    });
    expect(message.content).toEqual([
      { type: 'thinking', thinking: '思考', thinkingSignature: 'thinking-signed' },
      {
        type: 'thinking',
        thinking: '[Reasoning redacted]',
        thinkingSignature: 'redacted-signed',
        redacted: true,
      },
      { type: 'text', text: '你好 🌸' },
      { type: 'toolCall', id: 'call-a', name: 'lookup', arguments: { city: '北京' } },
    ]);
    expect(message.usage).toMatchObject({
      input: 20,
      output: 10,
      cacheRead: 3,
      cacheWrite: 2,
      reasoning: 4,
      totalTokens: 35,
    });
    expect(wire[0]).toMatchObject({
      type: 'message_start',
      message: { content: [], usage: ANTHROPIC.usage },
    });
    expect(
      wire.filter((event) => event.type === 'content_block_start').map((event) => event.index),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    for (const [index, block] of ANTHROPIC.content.entries()) {
      const blockEvents = wire.filter((event) => event.index === index);
      expect(blockEvents[0]).toMatchObject({
        type: 'content_block_start',
        content_block: { type: block.type },
      });
      expect(blockEvents.at(-1)).toEqual({ type: 'content_block_stop', index });
      if (block.type === 'tool_use' || block.type === 'server_tool_use') {
        expect(blockEvents[0].content_block).toMatchObject({ input: {} });
        expect(blockEvents[1]).toMatchObject({
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(block.input) },
        });
      }
    }
    expect(wire.filter((event) => event.index === 4)).toEqual([
      { type: 'content_block_start', index: 4, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 4, delta: { type: 'text_delta', text: '你好 🌸' } },
      {
        type: 'content_block_delta',
        index: 4,
        delta: { type: 'citations_delta', citation: ANTHROPIC.content[4].citations![0] },
      },
      { type: 'content_block_stop', index: 4 },
    ]);
    expect(wire.at(-2)).toEqual({
      type: 'message_delta',
      delta: { stop_reason: 'tool_use', stop_sequence: 'END' },
      usage: ANTHROPIC.usage,
    });
    expect(wire.at(-1)).toEqual({ type: 'message_stop' });
    expect(
      events.filter((event) => event.type === 'toolcall_delta').map((event) => event.delta),
    ).toEqual(['{"city":"北京"}']);
    const result = readPiWebResult(web.settle(message));
    expect(result?.sources).toContainEqual(
      expect.objectContaining({ url: 'https://source.test/', title: 'Source' }),
    );
    expect(result?.anthropicContent).toEqual(ANTHROPIC.content);
    expect(result?.anthropicContent?.[4].citations).toHaveLength(1);
  });

  test.each(['google-generative-ai', 'google-vertex'] as const)(
    '%s preserves complete JSON in one frame with EOF and no DONE sentinel',
    async (api) => {
      const response = await createPiNonStreamingFetch(api, async () => finiteResponse(GOOGLE))(
        'https://test/models/m:streamGenerateContent?alt=sse',
        init,
      );
      const reader = response.body!.getReader();
      const first = new TextDecoder().decode((await reader.read()).value);
      expect(first).toBe(`data: ${JSON.stringify(GOOGLE)}\n\n`);
      expect(first).not.toContain('[DONE]');
      expect(await reader.read()).toEqual({ done: true, value: undefined });
      const wire: unknown[] = [];
      const web = new PiWebResponse('finite', 'google');
      const { message, events } = await collect(
        api,
        createPiNonStreamingFetch(api, async () => finiteResponse(GOOGLE)),
        {
          onProviderStreamEvent: (event) => {
            wire.push(event);
            web.observe(event);
          },
        },
      );
      expect(events.at(-1)?.type).toBe('done');
      expect(wire).toEqual([expect.objectContaining(GOOGLE)]);
      expect(message).toMatchObject({
        stopReason: 'toolUse',
        rawStopReason: 'STOP',
        responseId: 'google-finite',
      });
      expect(message.content).toEqual([
        { type: 'thinking', thinking: '思考', thinkingSignature: 'thinking-signed' },
        { type: 'text', text: '你好 🌸', textSignature: 'text-signed' },
        {
          type: 'toolCall',
          id: 'call-a',
          name: 'lookup',
          arguments: { city: '北京' },
          thoughtSignature: 'tool-signed',
        },
      ]);
      expect(message.usage).toMatchObject({
        input: 17,
        output: 10,
        cacheRead: 3,
        reasoning: 4,
        totalTokens: 30,
      });
      const result = readPiWebResult(web.settle(message));
      expect(result?.sources).toContainEqual(
        expect.objectContaining({ url: 'https://source.test/', title: 'Source' }),
      );
      expect(result?.googleParts?.map((item) => item.part)).toEqual(
        GOOGLE.candidates[0].content.parts.filter(
          (part) => 'toolCall' in part || 'toolResponse' in part,
        ),
      );
    },
  );

  test('Codex unsupported error retains its local identity through terminal diagnostics', () => {
    const error = new PiNonStreamingUnsupportedError('openai-codex-responses');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(
      'This transport requires streaming. Turn on streaming for this model.',
    );
    const event = providerErrorEvent(emptyAssistantMessage(model('openai-codex-responses')), error);
    expect(event.type).toBe('error');
    expect(event.error.stopReason).toBe('error');
    expect(event.error.content).toEqual([]);
    expect(event.error.diagnostics?.at(-1)).toMatchObject({
      error: { name: 'PiNonStreamingUnsupportedError', code: 'non_streaming_mode_unsupported' },
      details: { retryable: false },
    });
    expect(isRetryableAssistantError(event.error)).toBe(false);
    expect(readPiTerminalError(event.error)).toMatchObject({ code: error.code, retryable: false });
    for (const api of APIS) expect(() => assertPiNonStreamingSupported(api)).not.toThrow();
  });

  test.each(APIS)('%s emits no content until all bytes AND EOF arrive', async (api) => {
    const source = controlledResponse();
    const events: AssistantMessageEvent[] = [];
    const run = (async () => {
      for await (const event of PARSERS[api](
        model(api),
        normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
        {
          apiKey: 'key',
          maxRetries: 0,
          fetch: createPiNonStreamingFetch(api, async () => source.response),
        },
      ))
        events.push(event);
    })();
    const json = JSON.stringify(fixture(api));
    source.write(json.slice(0, -10));
    await flush();
    expect(source.pull).toHaveBeenCalled();
    expect(events.filter((event) => event.type !== 'start')).toEqual([]);
    source.write(json.slice(-10));
    await flush();
    expect(events.filter((event) => event.type !== 'start')).toEqual([]);
    source.close();
    await run;
    expect(events.some((event) => event.type === 'text_delta' && event.delta === '你好 🌸')).toBe(
      true,
    );
    expect(events.some((event) => event.type === 'thinking_delta')).toBe(true);
    expect(events.some((event) => event.type === 'toolcall_delta')).toBe(true);
    expect(events.at(-1)?.type).toBe('done');
  });

  test('completions preserves text, reasoning details, tool indexes, Google signatures, usage and native extras', async () => {
    const wire: unknown[] = [];
    const { message } = await collect(
      'openai-completions',
      createPiNonStreamingFetch('openai-completions', async () => finiteResponse(COMPLETION)),
      {
        onProviderStreamEvent: (event) => {
          wire.push(event);
        },
      },
    );
    expect(message.stopReason).toBe('toolUse');
    expect(message.rawStopReason).toBe('tool_calls');
    expect(message.responseId).toBe('chat-1');
    expect(message.responseModel).toBe('actual-model');
    expect(message.content).toEqual([
      { type: 'thinking', thinking: '思考', thinkingSignature: JSON.stringify(REASONING_DETAILS) },
      { type: 'text', text: '你好 🌸' },
      {
        type: 'toolCall',
        id: 'call-a',
        name: 'lookup',
        arguments: { city: '北京' },
        thoughtSignature: 'google-signed',
      },
      { type: 'toolCall', id: 'call-b', name: 'other', arguments: { count: 2 } },
    ]);
    expect(message.usage).toMatchObject({
      input: 17,
      output: 10,
      cacheRead: 3,
      reasoning: 4,
      totalTokens: 30,
    });
    expect(wire[0]).toMatchObject({
      id: COMPLETION.id,
      model: COMPLETION.model,
      provider_extra: COMPLETION.provider_extra,
      choices: [
        {
          logprobs: { extra: true },
          delta: {
            ...COMPLETION.choices[0].message,
            tool_calls: COMPLETION.choices[0].message.tool_calls.map((tool, index) => ({
              ...tool,
              index,
            })),
          },
        },
      ],
    });
    expect(wire.at(-1)).toMatchObject({ usage: COMPLETION.usage, choices: [] });
  });

  test.each([null, undefined])(
    'completions accepts finish_reason %s without inventing it',
    async (finishReason) => {
      const choice = {
        message: { role: 'assistant', content: 'Finite answer' },
        ...(finishReason === null ? { finish_reason: null } : {}),
      };
      const wire: unknown[] = [];
      const { message, events } = await collect(
        'openai-completions',
        createPiNonStreamingFetch('openai-completions', async () =>
          finiteResponse({ ...COMPLETION, choices: [choice] }),
        ),
        {
          onProviderStreamEvent: (event) => {
            wire.push(event);
          },
        },
        { ...model('openai-completions'), compat: { supportsFinishReason: false } },
      );
      expect(events.at(-1)?.type).toBe('done');
      expect(message.content).toEqual([{ type: 'text', text: 'Finite answer' }]);
      expect(wire[0]).toMatchObject({ choices: [{ delta: choice.message }] });
      expect((wire[0] as typeof COMPLETION).choices[0].finish_reason).toBe(finishReason);
    },
  );

  test.each(APIS)(
    '%s preserves retryable stream_disconnected body failures through the parser',
    async (api) => {
      const error = Object.assign(new Error('Connection interrupted'), {
        code: 'stream_disconnected',
        retryable: true,
      });
      const source = controlledResponse();
      source.fail(error);
      const response = await createPiNonStreamingFetch(api, async () => source.response)(
        'https://test',
        init,
      );
      await expect(response.body!.getReader().read()).rejects.toBe(error);
      const next = controlledResponse();
      next.fail(error);
      const { message, events } = await collect(
        api,
        createPiNonStreamingFetch(api, async () => next.response),
      );
      expect(events.at(-1)?.type).toBe('error');
      expect(message.content).toEqual([]);
      expect(message.diagnostics?.at(-1)).toMatchObject({
        error: { code: 'stream_disconnected' },
        details: { retryable: true },
      });
      expect(isRetryableAssistantError(message)).toBe(true);
    },
  );

  test.each([
    { choices: [] },
    { choices: {} },
    { choices: [{ message: null }] },
    ...[
      { type: 'function', function: { name: 'lookup', arguments: '{}' } },
      { id: 'call', type: 'function', function: { arguments: '{}' } },
      { id: 'call', type: 'function', function: { name: 'lookup' } },
    ].map((tool) => ({ choices: [{ message: { tool_calls: [tool] } }] })),
  ])('completions rejects unusable choices and malformed tools: %j', async (value) => {
    const { message, events } = await collect(
      'openai-completions',
      createPiNonStreamingFetch('openai-completions', async () => finiteResponse(value)),
    );
    expect(events.at(-1)?.type).toBe('error');
    expect(message.content).toEqual([]);
    expect(message.diagnostics?.at(-1)).toMatchObject({
      error: { code: 'non_streaming_response_invalid' },
      details: { retryable: false },
    });
    expect(isRetryableAssistantError(message)).toBe(false);
  });

  test('binding keeps a genuine inner reader disconnect retryable through finite translation', async () => {
    const source = controlledResponse();
    source.fail(new Error('网络连接已中断'));
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS);
    const stream = await bindPiStream(
      {
        ...adapter,
        loadStreamSimple: async () =>
          jest.requireActual('@earendil-works/pi-ai/api/openai-completions').streamSimple,
      },
      {
        shouldStream: false,
        apiKey: 'test-key',
        fetch: async () => source.response,
        headers: {},
        maxRetries: 0,
        maxTokens: 256,
      },
    );
    const result = await (
      await stream(
        model('openai-completions'),
        normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
        {},
      )
    ).result();
    expect(result.stopReason).toBe('error');
    expect(result.content).toEqual([]);
    expect(isRetryableAssistantError(result)).toBe(true);
    expect(piModelTerminalErrorAttributes(result)).toMatchObject({
      'error.code': 'stream_disconnected',
      'error.stage': 'stream',
      'error.category': 'network',
      'error.retryable': true,
    });
  });

  test.each(['retryable', 'stream_disconnected', 'no_response', 'unclassified'] as const)(
    'preserves the original %s reader failure unchanged',
    async (classification) => {
      const error = Object.assign(
        new Error('Read failed'),
        classification === 'retryable'
          ? { retryable: true }
          : classification === 'unclassified'
            ? {}
            : { code: classification },
      );
      const source = controlledResponse();
      source.fail(error);
      const response = await createPiNonStreamingFetch(
        'openai-completions',
        async () => source.response,
      )('https://test', init);
      await expect(response.body!.getReader().read()).rejects.toBe(error);
    },
  );

  test.each(
    NEW_APIS.flatMap((api) => {
      const shapes =
        api === 'anthropic-messages'
          ? [
              { ...ANTHROPIC, content: {} },
              { ...ANTHROPIC, usage: null },
              { ...ANTHROPIC, content: [...ANTHROPIC.content, { type: 'text', text: 1 }] },
              ...[
                { name: 'lookup', input: {} },
                { id: 'call', input: {} },
                { id: 'call', name: 'lookup' },
              ].map((tool) => ({
                ...ANTHROPIC,
                content: [...ANTHROPIC.content, { type: 'tool_use', ...tool }],
              })),
            ]
          : [
              { ...GOOGLE, candidates: [] },
              { ...GOOGLE, candidates: {} },
              { ...GOOGLE, candidates: [{ ...GOOGLE.candidates[0], content: { parts: {} } }] },
              {
                ...GOOGLE,
                candidates: [
                  {
                    ...GOOGLE.candidates[0],
                    content: { parts: [...GOOGLE.candidates[0].content.parts, { text: 1 }] },
                  },
                ],
              },
              { ...GOOGLE, usageMetadata: [] },
              { ...GOOGLE, candidates: [{ content: GOOGLE.candidates[0].content }] },
            ];
      return shapes.map((value, index) => ({ api, value, index }));
    }),
  )('$api rejects malformed shape $index before emitting any content', async ({ api, value }) => {
    const wire: unknown[] = [];
    const { message, events } = await collect(
      api,
      createPiNonStreamingFetch(api, async () => finiteResponse(value)),
      {
        onProviderStreamEvent: (event) => {
          wire.push(event);
        },
      },
    );
    expect(wire).toEqual([]);
    expect(events.at(-1)?.type).toBe('error');
    expect(events.some((event) => event.type === 'done')).toBe(false);
    expect(message.content).toEqual([]);
    expect(message.diagnostics?.at(-1)).toMatchObject({
      error: { code: 'non_streaming_response_invalid' },
      details: { retryable: false },
    });
    expect(isRetryableAssistantError(message)).toBe(false);
  });

  test.each(['reasoning_content', 'reasoning', 'reasoning_text'])(
    'completions preserves %s',
    async (field) => {
      const value = {
        ...COMPLETION,
        choices: [
          {
            message: { role: 'assistant', content: 'Answer', [field]: 'Reason' },
            finish_reason: 'stop',
          },
        ],
      };
      const { message } = await collect(
        'openai-completions',
        createPiNonStreamingFetch('openai-completions', async () => finiteResponse(value)),
      );
      expect(message.content).toEqual([
        { type: 'thinking', thinking: 'Reason', thinkingSignature: field },
        { type: 'text', text: 'Answer' },
      ]);
      expect(message.stopReason).toBe('stop');
    },
  );

  test.each(['openai-responses', 'azure-openai-responses'] as const)(
    '%s preserves item identity, encrypted reasoning, phase, native web data and arguments exactly once',
    async (api) => {
      const wire: Record<string, unknown>[] = [];
      const web = new PiWebResponse('finite', 'openai-responses');
      const { message, events } = await collect(
        api,
        createPiNonStreamingFetch(api, async () => finiteResponse(RESPONSE)),
        {
          onProviderStreamEvent: (event) => {
            wire.push(event as Record<string, unknown>);
            web.observe(event);
          },
        },
      );
      expect(message.stopReason).toBe('toolUse');
      expect(message.rawStopReason).toBe('completed');
      expect(message.responseId).toBe('resp-1');
      expect(message.content).toEqual([
        {
          type: 'thinking',
          thinking: '思考',
          thinkingSignature: JSON.stringify(RESPONSE.output[0]),
        },
        expect.objectContaining({
          type: 'text',
          text: '你好 🌸',
          textSignature: expect.stringContaining('final_answer'),
        }),
        {
          type: 'toolCall',
          id: 'call-a|fc-1',
          name: 'lookup',
          namespace: 'weather',
          arguments: { city: '北京' },
        },
        { type: 'toolCall', id: 'call-b|fc-2', name: 'other', arguments: { count: 2 } },
      ]);
      expect(message.usage).toMatchObject({
        input: 17,
        output: 10,
        cacheRead: 3,
        reasoning: 4,
        totalTokens: 30,
      });
      const webResult = readPiWebResult(web.settle(message));
      expect(webResult?.sources).toContainEqual(
        expect.objectContaining({ url: 'https://source.test/', title: 'Source' }),
      );
      expect(webResult?.openaiItems).toContainEqual({ after: 'rs-1', item: RESPONSE.output[1] });
      expect(wire[0]).toEqual({ type: 'response.created', response: RESPONSE });
      expect(wire.filter((event) => event.type === 'response.output_item.done')).toEqual(
        RESPONSE.output.map((item, index) => ({
          type: 'response.output_item.done',
          output_index: index,
          item_id: item.id,
          item,
        })),
      );
      expect(wire.at(-1)).toEqual({ type: 'response.completed', response: RESPONSE });
      for (const index of [3, 4]) {
        const itemEvents = wire.filter((event) => event.output_index === index);
        expect(itemEvents.map((event) => event.type)).toEqual([
          'response.output_item.added',
          'response.function_call_arguments.delta',
          'response.output_item.done',
        ]);
        expect(itemEvents[0].item).toEqual({ ...RESPONSE.output[index], arguments: '' });
      }
      expect(
        events.filter((event) => event.type === 'toolcall_delta').map((event) => event.delta),
      ).toEqual(['{"city":"北京"}', '{"count":2}']);
    },
  );

  test.each(APIS)('%s reconstructs Unicode split at every UTF-8 byte boundary', async (api) => {
    const source = controlledResponse();
    for (const byte of new TextEncoder().encode(JSON.stringify(fixture(api))))
      source.write(new Uint8Array([byte]));
    source.close();
    const { message } = await collect(
      api,
      createPiNonStreamingFetch(api, async () => source.response),
    );
    expect(message.content).toContainEqual(
      expect.objectContaining({ type: 'text', text: '你好 🌸' }),
    );
  });

  test('synthetic headers preserve status, IDs and retry metadata and remove stale entity headers', async () => {
    const source = controlledResponse({
      status: 201,
      statusText: 'Created',
      headers: {
        'content-type': 'application/json',
        'content-length': '100',
        'content-encoding': 'gzip',
        'transfer-encoding': 'chunked',
        'x-request-id': 'request-1',
        'retry-after': '3',
        'x-ratelimit-remaining-requests': '10',
      },
    });
    const response = await createPiNonStreamingFetch(
      'openai-completions',
      async () => source.response,
    )('https://test', init);
    expect(source.pull).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
    expect(response.statusText).toBe('Created');
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    for (const name of ['content-length', 'content-encoding', 'transfer-encoding'])
      expect(response.headers.has(name)).toBe(false);
    for (const name of ['x-request-id', 'retry-after', 'x-ratelimit-remaining-requests'])
      expect(response.headers.get(name)).toBe(source.response.headers.get(name));
    source.write(JSON.stringify(COMPLETION));
    source.close();
    expect(await readBody(response)).toContain('data: [DONE]\n\n');
  });

  test.each(APIS)(
    '%s preserves non-2xx status, headers and body for SDK error classification',
    async (api) => {
      const response = new Response(
        '{"error":{"code":"rate_limit_exceeded","message":"Limited"}}',
        { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '2' } },
      );
      const adapted = await createPiNonStreamingFetch(api, async () => response)(
        'https://test',
        init,
      );
      expect(adapted.status).toBe(response.status);
      expect(adapted.statusText).toBe(response.statusText);
      expect([...adapted.headers]).toEqual([...response.headers]);
      expect(adapted).toBe(response);
      const { message } = await collect(api, async () => adapted);
      expect(message.stopReason).toBe('error');
      expect(message.errorMessage).toContain('Limited');
      expect(isRetryableAssistantError(message)).toBe(true);
      expect(message.diagnostics?.at(-1)?.details).toMatchObject({ status: 429 });
    },
  );

  test.each(APIS.flatMap((api) => [null, {}].map((body) => ({ api, body }))))(
    '$api rejects absent or unreadable bodies as protocol errors',
    async ({ api, body }) => {
      const response = new Response(null, { status: 200 });
      Object.defineProperty(response, 'body', { value: body, configurable: true });
      const adapted = await createPiNonStreamingFetch(api, async () => response)(
        'https://test',
        init,
      );
      await expect(adapted.body!.getReader().read()).rejects.toMatchObject({
        code: 'non_streaming_response_invalid',
        retryable: false,
      });
    },
  );

  test.each(APIS)(
    '%s leaves absent-body failure to the SDK without turning it into success',
    async (api) => {
      const response = new Response(null);
      Object.defineProperty(response, 'body', { value: null });
      const { message } = await collect(
        api,
        createPiNonStreamingFetch(api, async () => response),
      );
      expect(message.stopReason).toBe('error');
      expect(isRetryableAssistantError(message)).toBe(false);
      expect(message.diagnostics?.at(-1)).toMatchObject({
        error: { code: 'non_streaming_response_invalid' },
        details: { retryable: false },
      });
    },
  );

  const INVALID = [
    { name: 'empty body', text: '', reason: 'invalid_json' },
    { name: 'invalid JSON', text: '{broken', reason: 'invalid_json' },
    { name: 'truncated JSON', text: '{"choices": [', reason: 'invalid_json' },
    { name: 'wrong shape', text: '{"unknown":true}', reason: 'invalid_response' },
    { name: 'primitive', text: 'null', reason: 'invalid_response' },
  ];
  test.each(APIS.flatMap((api) => INVALID.map((value) => ({ ...value, api }))))(
    '$api: $name fails lazily with a non-retryable protocol classification',
    async ({ api, text, reason }) => {
      const source = controlledResponse({
        headers: { 'content-type': 'application/json' },
      });
      source.write(text);
      source.close();
      const response = await createPiNonStreamingFetch(api, async () => source.response)(
        'https://test',
        init,
      );
      expect(source.pull).not.toHaveBeenCalled();
      await expect(response.body!.getReader().read()).rejects.toMatchObject({
        name: 'PiNonStreamingResponseError',
        code: 'non_streaming_response_invalid',
        retryable: false,
        reason,
      });
      const second = controlledResponse({
        headers: { 'content-type': 'application/json' },
      });
      second.write(text);
      second.close();
      const fetch = jest.fn(async () => second.response);
      const { message } = await collect(api, createPiNonStreamingFetch(api, fetch));
      expect(message.stopReason).toBe('error');
      expect(message.content).toEqual([]);
      expect(message.diagnostics?.at(-1)).toMatchObject({
        error: { name: 'PiNonStreamingResponseError', code: 'non_streaming_response_invalid' },
        details: { retryable: false },
      });
      expect(isRetryableAssistantError(message)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  test.each(
    APIS.flatMap((api) =>
      ['application/json', 'text/event-stream'].map((contentType) => ({ api, contentType })),
    ),
  )(
    '$api rejects unexpected SSE ($contentType) and asks for streaming',
    async ({ api, contentType }) => {
      const unexpectedStream = () => {
        const source = controlledResponse({ headers: { 'content-type': contentType } });
        source.write('data: [DONE]\n\n');
        source.close();
        return source;
      };
      const source = unexpectedStream();
      const response = await createPiNonStreamingFetch(api, async () => source.response)(
        'https://test',
        init,
      );
      expect(source.pull).not.toHaveBeenCalled();
      await expect(response.body!.getReader().read()).rejects.toMatchObject({
        name: 'PiNonStreamingUnsupportedError',
        code: 'non_streaming_mode_unsupported',
        retryable: false,
        api,
      });
      const fetch = jest.fn(async () => unexpectedStream().response);
      const { message } = await collect(api, createPiNonStreamingFetch(api, fetch));
      expect(message.stopReason).toBe('error');
      expect(message.content).toEqual([]);
      expect(message.diagnostics?.at(-1)).toMatchObject({
        error: { name: 'PiNonStreamingUnsupportedError', code: 'non_streaming_mode_unsupported' },
        details: { retryable: false },
      });
      expect(readPiTerminalError(message)).toMatchObject({
        code: 'non_streaming_mode_unsupported',
        retryable: false,
      });
      expect(isRetryableAssistantError(message)).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  test.each([
    { chunks: ['da', 'ta: [DONE]\n\n'] },
    { chunks: ['event: message\n'] },
    { chunks: [': keepalive\n\n'] },
  ])(
    'rejects a still-open SSE body with the prefix $chunks before the idle timeout',
    async ({ chunks }) => {
      const source = controlledResponse();
      for (const chunk of chunks) source.write(chunk);
      const fetch = jest.fn(async () => source.response);
      const stream = await bindPiStream(
        {
          ...bindingAdapter('openai-completions'),
          loadStreamSimple: async () =>
            jest.requireActual('@earendil-works/pi-ai/api/openai-completions').streamSimple,
        },
        { shouldStream: false, apiKey: 'key', fetch, headers: {}, maxRetries: 0, maxTokens: 256 },
      );
      const nextKey = jest.fn(async () => stream);
      const idleMs = 30;
      const resolved = withPiStreamIdleTimeout(
        withPiApiKeyFallback([async () => stream, nextKey]),
        idleMs,
      );
      jest.useFakeTimers();
      try {
        const result = (
          await resolved(
            model('openai-completions'),
            normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
          )
        ).result();
        await jest.advanceTimersByTimeAsync(idleMs);
        const message = await result;
        expect(message.diagnostics?.at(-1)).toMatchObject({
          error: { code: 'non_streaming_mode_unsupported' },
          details: { retryable: false },
        });
        expect(readPiTerminalError(message)).toMatchObject({
          code: 'non_streaming_mode_unsupported',
          retryable: false,
        });
        expect(isRetryableAssistantError(message)).toBe(false);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(nextKey).not.toHaveBeenCalled();
        expect(source.cancel).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  test.each([undefined, 'queued', 'in_progress', 'unknown'])(
    'Responses rejects nonterminal status %s before emitting content',
    async (status) => {
      const { message } = await collect(
        'openai-responses',
        createPiNonStreamingFetch('openai-responses', async () =>
          finiteResponse({ ...RESPONSE, status }),
        ),
      );
      expect(message.stopReason).toBe('error');
      expect(message.content).toEqual([]);
      expect(isRetryableAssistantError(message)).toBe(false);
    },
  );

  test.each(['openai-responses', 'azure-openai-responses'] as const)(
    '%s preserves incomplete and failed terminal responses',
    async (api) => {
      const incomplete = {
        ...RESPONSE,
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      };
      const { message } = await collect(
        api,
        createPiNonStreamingFetch(api, async () => finiteResponse(incomplete)),
      );
      expect(message.stopReason).toBe('length');
      expect(message.rawStopReason).toBe('incomplete.max_output_tokens');
      const failed = {
        ...RESPONSE,
        status: 'failed',
        error: { code: 'invalid_request', message: 'Provider rejected this' },
      };
      const wire: unknown[] = [];
      const result = await collect(
        api,
        createPiNonStreamingFetch(api, async () => finiteResponse(failed)),
        {
          onProviderStreamEvent: (value) => {
            wire.push(value);
          },
        },
      );
      expect(result.message.stopReason).toBe('error');
      expect(result.message.errorMessage).toContain('Provider rejected this');
      expect(wire.at(-1)).toEqual({ type: 'response.failed', response: failed });
    },
  );

  test.each(['openai-responses', 'azure-openai-responses'] as const)(
    '%s accepts function and custom tool calls without a provider item id',
    async (api) => {
      const output = [
        { type: 'function_call', call_id: 'call-a', name: 'lookup', arguments: '{"n":1}' },
        { type: 'custom_tool_call', call_id: 'call-b', name: 'query', input: 'n=1' },
      ];
      const { message } = await collect(
        api,
        createPiNonStreamingFetch(api, async () => finiteResponse({ ...RESPONSE, output })),
      );
      expect(message.stopReason).toBe('toolUse');
      expect(message.content).toEqual([
        { type: 'toolCall', id: 'call-a|', name: 'lookup', arguments: { n: 1 } },
        { type: 'toolCall', id: 'call-b|', name: 'query', arguments: { input: 'n=1' } },
      ]);

      const invalid = await collect(
        api,
        createPiNonStreamingFetch(api, async () =>
          finiteResponse({ ...RESPONSE, output: [{ ...output[0], call_id: undefined }] }),
        ),
      );
      expect(invalid.message.content).toEqual([]);
      expect(readPiTerminalError(invalid.message)).toMatchObject({
        code: 'non_streaming_response_invalid',
        retryable: false,
      });
    },
  );

  test('Responses supports raw reasoning content, refusals and custom tool input without duplication', async () => {
    const output = [
      {
        type: 'reasoning',
        id: 'rs',
        content: [{ type: 'reasoning_text', text: 'Raw reasoning' }],
        encrypted_content: 'opaque',
      },
      {
        type: 'message',
        id: 'msg',
        role: 'assistant',
        content: [{ type: 'refusal', refusal: 'Declined' }],
      },
      {
        type: 'custom_tool_call',
        id: 'ctc',
        call_id: 'call',
        name: 'shell',
        namespace: 'local',
        input: 'echo hi',
      },
    ];
    const { message } = await collect(
      'openai-responses',
      createPiNonStreamingFetch('openai-responses', async () =>
        finiteResponse({ ...RESPONSE, output }),
      ),
    );
    expect(message.content).toEqual([
      { type: 'thinking', thinking: 'Raw reasoning', thinkingSignature: JSON.stringify(output[0]) },
      expect.objectContaining({ type: 'text', text: 'Declined' }),
      {
        type: 'toolCall',
        id: 'call|ctc',
        name: 'shell',
        namespace: 'local',
        arguments: { input: 'echo hi' },
      },
    ]);
  });

  test('does not use native text/json methods and exposes its own error type', async () => {
    const response = finiteResponse(COMPLETION);
    response.text = jest.fn(() => {
      throw new Error('native state bypass');
    });
    response.json = jest.fn(() => {
      throw new Error('native state bypass');
    });
    const result = await collect(
      'openai-completions',
      createPiNonStreamingFetch('openai-completions', async () => response),
    );
    expect(result.message.stopReason).toBe('toolUse');
    expect(response.text).not.toHaveBeenCalled();
    expect(response.json).not.toHaveBeenCalled();
    expect(new PiNonStreamingResponseError('invalid_json')).toBeInstanceOf(Error);
  });

  test('abort before headers rejects promptly, aborts real fetch and cancels late body', async () => {
    const caller = new AbortController();
    let resolve!: (response: Response) => void;
    let signal!: AbortSignal;
    const source = controlledResponse();
    const fetch: FetchFunction = (_url, options) => {
      signal = options!.signal!;
      return new Promise((done) => {
        resolve = done;
      });
    };
    const pending = createPiNonStreamingFetch('openai-completions', fetch)('https://test', {
      ...init,
      signal: caller.signal,
    });
    caller.abort(new Error('caller abort'));
    await expect(pending).rejects.toThrow('caller abort');
    expect(signal.aborted).toBe(true);
    resolve(source.response);
    await flush();
    expect(source.cancel).toHaveBeenCalledTimes(1);
  });

  test('already aborted signal cannot emit content even when the transport ignores it', async () => {
    const caller = new AbortController();
    caller.abort(new Error('already aborted'));
    const source = controlledResponse();
    await expect(
      createPiNonStreamingFetch('openai-completions', async () => source.response)('https://test', {
        ...init,
        signal: caller.signal,
      }),
    ).rejects.toThrow('already aborted');
    await flush();
    expect(source.cancel).toHaveBeenCalledTimes(1);
  });

  test.each(APIS)(
    '%s abort mid-body cancels the real reader and prevents all late content',
    async (api) => {
      const source = controlledResponse();
      const caller = new AbortController();
      let realSignal!: AbortSignal;
      const adapter = createPiNonStreamingFetch(api, async (_url, options) => {
        realSignal = options!.signal!;
        return source.response;
      });
      const response = await adapter('https://test', { ...init, signal: caller.signal });
      const reader = response.body!.getReader();
      source.write('{"id":');
      const pending = reader.read();
      await flush();
      caller.abort(new Error('mid-body abort'));
      await expect(pending).rejects.toThrow('mid-body abort');
      await expect(reader.read()).rejects.toThrow('mid-body abort');
      expect(realSignal.aborted).toBe(true);
      expect(source.cancel).toHaveBeenCalledTimes(1);
    },
  );

  test.each([false, true])(
    'synthetic reader cancel aborts the real request (reading started: %s)',
    async (hasStarted) => {
      const source = controlledResponse();
      let realSignal!: AbortSignal;
      const response = await createPiNonStreamingFetch(
        'openai-completions',
        async (_url, options) => {
          realSignal = options!.signal!;
          return source.response;
        },
      )('https://test', init);
      const reader = response.body!.getReader();
      const pending = hasStarted ? reader.read() : undefined;
      if (hasStarted) {
        source.write('{');
        await flush();
      }
      await reader.cancel('consumer done');
      if (pending) expect(await pending).toEqual({ done: true, value: undefined });
      expect(await reader.read()).toEqual({ done: true, value: undefined });
      expect(realSignal.aborted).toBe(true);
      expect(source.cancel).toHaveBeenCalledTimes(1);
    },
  );

  test('abort after translation prevents queued events from being delivered', async () => {
    const caller = new AbortController();
    const response = await createPiNonStreamingFetch('openai-responses', async () =>
      finiteResponse(RESPONSE),
    )('https://test', { ...init, signal: caller.signal });
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('response.created');
    caller.abort(new Error('stop delivery'));
    await expect(reader.read()).rejects.toThrow('stop delivery');
  });
});
