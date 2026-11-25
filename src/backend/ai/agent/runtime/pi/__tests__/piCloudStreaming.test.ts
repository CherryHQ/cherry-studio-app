import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import type { Model as PiModel } from '@earendil-works/pi-ai';
import { streamSimple as streamSimpleAnthropic } from '@earendil-works/pi-ai/api/anthropic-messages';
import { streamSimple as streamSimpleCompletions } from '@earendil-works/pi-ai/api/openai-completions';
import { isRetryableAssistantError } from '@earendil-works/pi-ai/utils/retry';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import type { DbService } from '@/backend/data/db/DbService';
import { cloudSnapshot } from '@/backend/services/cloud/__tests__/_cloudFixtures';
import { CloudRuntime } from '@/backend/services/cloud/CloudRuntime';
import { projectDiagnosticTrace } from '@/backend/services/diagnostics/diagnosticMetadata';
import { CLOUD_PROVIDER_ID, type CloudModel } from '@/shared/contracts/cloud';

import { createTraceRecorder } from '../../../../observability/__tests__/_traceRecorder';
import { toAgentErrorView } from '../../../host/runtimeProjection';
import { bindPiStream, resolvePiApiAdapter, type SupportedPiApi } from '../piApiAdapters';
import { piModelTerminalErrorAttributes } from '../piModelDiagnostics';
import { readPiTerminalError } from '../piModelError';
import type { PiStreamFn } from '../piModelTypes';
import { withPiStreamIdleTimeout } from '../piStreamIdleTimeout';

const service = { apiOrigin: 'https://cloud.example' };
const mockGet = jest.fn();
const mockInference = jest.fn();

jest.mock('expo/fetch', () => ({ fetch: (...args: unknown[]) => mockInference(...args) }));
jest.mock('@/backend/services/cloud/cloudDevice', () => ({
  loadCloudDevice: async () => ({}),
  createCloudIdempotencyKey: () => 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8',
}));
jest.mock('@/backend/services/cloud/cloudClientSignature', () => ({
  cloudClientSignatureHeaders: async () => ({}),
}));
jest.mock('@/backend/services/cloud/projectCloudModels', () => ({
  projectCloudModels: async () => [],
}));
jest.mock('@/backend/services/cloud/CloudSession', () => ({
  CloudSession: class {
    readonly origin: string;
    constructor(origin: string) {
      this.origin = origin;
    }
    get(path: string) {
      return mockGet('account-a', path);
    }
    async headers() {
      return {};
    }
    recoverRequest() {
      return false;
    }
    async revoke() {}
  },
}));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
jest.mock('@/backend/data/dataApiChanges', () => ({ publishDataApiChanges: jest.fn() }));

function reply(account: string, path: string) {
  const state = cloudSnapshot(account);
  if (path === '/api/v1/account') return state.account;
  if (path === '/api/v1/account/plans') return state.plans;
  if (path === '/v1/models?limit=1000&catalog=full') return { data: state.models };
  throw new Error(`Unexpected Cloud endpoint: ${path}`);
}

beforeEach(() => {
  mockGet
    .mockReset()
    .mockImplementation(async (account: string, path: string) => reply(account, path));
  mockInference.mockReset();
});
afterEach(() => {
  jest.restoreAllMocks();
});

async function setup() {
  const db = {
    withWriteTx: (write: (tx: unknown) => Promise<unknown>) => write({}),
  } as unknown as DbService;
  const runtime = new CloudRuntime(db);
  runtime.configure(
    {
      getIdentity: () => ({ key: 'a', profileId: 'account-a', ...service }),
      getTokens: async () => ({ accessToken: '', idToken: '' }),
      subscribe: () => () => {},
    },
    '0.6.0',
  );
  await runtime._doInit();
  await runtime._doAllReady();
  return runtime;
}

function inferenceResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const source = new ReadableStream<Uint8Array>(
    {
      start(value) {
        controller = value;
      },
    },
    { highWaterMark: 0 },
  );
  // Expo supplies a native body even though RN's global Response cannot construct one.
  const response = new Response(null, { headers: { 'content-type': 'text/event-stream' } });
  Object.defineProperty(response, 'body', { configurable: true, value: source });
  return {
    response,
    push: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
    close: () => controller.close(),
  };
}

function anthropicEvent(type: string, fields: Record<string, unknown> = {}): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
}

const originalStreamingGlobals = {
  ReadableStream: globalThis.ReadableStream,
  TextDecoder: globalThis.TextDecoder,
  TextEncoder: globalThis.TextEncoder,
};
beforeAll(() => {
  Object.assign(globalThis, { ReadableStream, TextDecoder, TextEncoder });
});
afterAll(() => {
  Object.assign(globalThis, originalStreamingGlobals);
});

test.each([
  {
    endpoint: 'anthropic-messages',
    streamSimple: streamSimpleAnthropic,
    first:
      anthropicEvent('message_start', {
        message: {
          id: 'reply',
          type: 'message',
          role: 'assistant',
          model: 'cloud-model',
          content: [],
          usage: { input_tokens: 1, output_tokens: 0 },
        },
      }) +
      anthropicEvent('content_block_start', {
        index: 0,
        content_block: { type: 'text', text: '' },
      }) +
      anthropicEvent('content_block_delta', {
        index: 0,
        delta: { type: 'text_delta', text: '你好' },
      }),
    last:
      anthropicEvent('content_block_stop', { index: 0 }) +
      anthropicEvent('message_delta', {
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 1 },
      }) +
      anthropicEvent('message_stop'),
  },
  {
    endpoint: 'openai-chat-completions',
    streamSimple: streamSimpleCompletions,
    first: `data: ${JSON.stringify({
      id: 'reply',
      choices: [{ index: 0, delta: { role: 'assistant', content: '你好' }, finish_reason: null }],
    })}\n\n`,
    last: `data: ${JSON.stringify({
      id: 'reply',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\ndata: [DONE]\n\n`,
  },
] as const)(
  'streams $endpoint through the existing Pi binding before EOF',
  async ({ endpoint, streamSimple, first, last }) => {
    mockGet.mockImplementation(async (account: string, path: string) =>
      path === '/v1/models?limit=1000&catalog=full'
        ? {
            data: cloudSnapshot(account).models.map((model) => ({
              ...model,
              endpoint_type: endpoint,
            })),
          }
        : reply(account, path),
    );
    const upstream = inferenceResponse();
    mockInference.mockResolvedValue(upstream.response);
    const runtime = await setup();
    try {
      await runtime.refresh();
      const send = runtime.createModelFetch('cloud-model', 'agent');
      let cloudResponse: Response | undefined;
      const adapter = resolvePiApiAdapter(endpoint);
      // Jest cannot evaluate the adapter's lazy import; Metro bundles it.
      jest
        .spyOn(adapter, 'loadStreamSimple')
        .mockResolvedValue(streamSimple as unknown as PiStreamFn);
      const streamFn = await bindPiStream(adapter, {
        apiKey: '',
        fetch: async (input, init) => {
          const response = await send(input, init);
          cloudResponse = response;
          return response;
        },
        headers: {},
        maxRetries: 0,
        maxTokens: 64,
      });
      const model: PiModel<SupportedPiApi> = {
        api: adapter.api,
        provider: 'cherryai-subscription',
        id: 'cloud-model',
        name: 'Cloud model',
        baseUrl: adapter.formatBaseUrl(service.apiOrigin),
        contextWindow: 4096,
        maxTokens: 64,
        input: ['text'],
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      const events = await streamFn(
        model,
        normalizeContext({ messages: [{ role: 'user', content: '你好', timestamp: Date.now() }] }),
      );
      let text = '';
      let received!: () => void;
      const firstText = new Promise<void>((resolve) => {
        received = resolve;
      });
      const finished = (async () => {
        for await (const event of events) {
          if (event.type === 'text_delta') {
            text += event.delta;
            received();
          }
        }
        return events.result();
      })();
      upstream.push(first);
      await Promise.race([
        firstText,
        finished.then((message) => {
          throw new Error(`Pi ended before a text delta: ${message.errorMessage}`);
        }),
      ]);
      expect(text).toBe('你好');
      expect(cloudResponse).toBe(upstream.response);
      expect(JSON.parse(mockInference.mock.lastCall![1].body)).toMatchObject({
        model: 'cloud-model',
        stream: true,
      });
      const signal = mockInference.mock.lastCall![1].signal as AbortSignal;
      expect(signal.aborted).toBe(false);
      upstream.push(last);
      upstream.close();
      expect((await finished).stopReason).toBe('stop');
    } finally {
      await runtime._doStop();
    }
  },
);

test.each([
  { activationRequired: false, status: 400, code: 'unsupported_parameter' },
  { activationRequired: false, status: 403, code: 'AMD_ACCESS_DENIED' },
  { activationRequired: false, status: 429, code: 'RATE_LIMITED' },
  { activationRequired: true, status: undefined, code: 'cloud_activation_required' },
])(
  'preserves a terminal AMD $code through the OpenAI stream',
  async ({ activationRequired, status, code }) => {
    const amd: CloudModel = {
      ...cloudSnapshot().models[0],
      activation_endpoint: '/api/v1/amd/desktop/entry',
      id: 'amd/free-model',
      provider: 'amd',
      requires_plan: false,
      is_free: true,
      endpoint_type: 'openai-chat-completions',
      activation_required: activationRequired,
    };
    mockGet.mockImplementation(async (account: string, path: string) =>
      path === '/v1/models?limit=1000&catalog=full' ? { data: [amd] } : reply(account, path),
    );
    const gatewayId = 'fedcba98765432100123456789abcdef';
    const forwarded = status === 400;
    if (status !== undefined)
      mockInference.mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code,
              ...(forwarded && {
                type: 'invalid_request_error',
                param: 'max_tokens',
                message: 'private provider text',
              }),
            },
          }),
          {
            status,
            headers: { 'content-type': 'application/json', 'X-Request-ID': gatewayId },
          },
        ),
      );
    const runtime = await setup();
    try {
      await runtime.refresh();
      const adapter = resolvePiApiAdapter(amd.endpoint_type);
      jest
        .spyOn(adapter, 'loadStreamSimple')
        .mockResolvedValue(streamSimpleCompletions as unknown as PiStreamFn);
      const stream = withPiStreamIdleTimeout(
        await bindPiStream(adapter, {
          apiKey: '',
          isCloudGateway: true,
          fetch: runtime.createModelFetch(amd.id, 'agent'),
          headers: {},
          maxRetries: 0,
          maxTokens: 64,
        }),
      );
      const model: PiModel<SupportedPiApi> = {
        api: adapter.api,
        provider: CLOUD_PROVIDER_ID,
        id: amd.id,
        name: amd.display_name,
        baseUrl: adapter.formatBaseUrl(service.apiOrigin),
        contextWindow: amd.context_window,
        maxTokens: 64,
        input: ['text'],
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      };
      const { traces, records } = createTraceRecorder();
      const trace = traces.startTrace('pi.generate_content');
      const source = await stream(
        model,
        normalizeContext({ messages: [{ role: 'user', content: '你好', timestamp: Date.now() }] }),
        { trace },
      );
      const result = await source.result();
      if (activationRequired) expect(mockInference).not.toHaveBeenCalled();
      expect(result.stopReason).toBe('error');
      expect(result.diagnostics?.at(-1)).toMatchObject({
        error: { code },
        details: {
          ...(status === undefined ? {} : { status }),
          ...(!forwarded && { retryable: false }),
        },
      });
      trace?.end('error', piModelTerminalErrorAttributes(result));
      const attributes = projectDiagnosticTrace(records.at(-1))?.attributes;
      expect(attributes?.['cherry.gateway.request_id']).toBe(
        status === undefined ? undefined : gatewayId,
      );
      if (forwarded) {
        expect(attributes).toMatchObject({
          'error.category': 'invalid_input',
          'error.provider.code': code,
          'error.provider.type': 'invalid_request_error',
          'error.provider.param': 'max_tokens',
        });
        expect(JSON.stringify(attributes)).not.toContain('private provider text');
      }
      expect(isRetryableAssistantError(result)).toBe(false);
    } finally {
      await runtime._doStop();
    }
  },
);

test('preserves upstream quota codes from a Cloud 429 response in trace and failure projection', async () => {
  const gatewayId = 'fedcba98765432100123456789abcdef';
  const modelSnapshot = cloudSnapshot().models[0]!;
  mockInference.mockResolvedValue(
    new Response(
      JSON.stringify({
        error: {
          code: 'insufficient_quota',
          type: 'rate_limit_error',
          message: 'private quota text',
        },
      }),
      {
        status: 429,
        headers: { 'content-type': 'application/json', 'X-Request-ID': gatewayId },
      },
    ),
  );
  const runtime = await setup();
  try {
    await runtime.refresh();
    const adapter = resolvePiApiAdapter(modelSnapshot.endpoint_type);
    jest
      .spyOn(adapter, 'loadStreamSimple')
      .mockResolvedValue(streamSimpleAnthropic as unknown as PiStreamFn);
    const stream = withPiStreamIdleTimeout(
      await bindPiStream(adapter, {
        apiKey: '',
        isCloudGateway: true,
        fetch: runtime.createModelFetch(modelSnapshot.id, 'agent'),
        headers: {},
        maxRetries: 0,
        maxTokens: 64,
      }),
    );
    const model: PiModel<SupportedPiApi> = {
      api: adapter.api,
      provider: CLOUD_PROVIDER_ID,
      id: modelSnapshot.id,
      name: modelSnapshot.display_name,
      baseUrl: adapter.formatBaseUrl(service.apiOrigin),
      contextWindow: modelSnapshot.context_window,
      maxTokens: 64,
      input: ['text'],
      reasoning: false,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const { traces, records } = createTraceRecorder();
    const trace = traces.startTrace('pi.generate_content');
    const source = await stream(
      model,
      normalizeContext({ messages: [{ role: 'user', content: '你好', timestamp: Date.now() }] }),
      { trace },
    );
    const result = await source.result();
    expect(result.stopReason).toBe('error');
    expect(isRetryableAssistantError(result)).toBe(false);
    trace?.end('error', piModelTerminalErrorAttributes(result));
    const attributes = projectDiagnosticTrace(records.at(-1))?.attributes;
    expect(attributes).toMatchObject({
      'cherry.gateway.request_id': gatewayId,
      'error.provider.code': 'insufficient_quota',
      'error.provider.type': 'rate_limit_error',
      'error.category': 'quota',
      'error.retryable': false,
    });
    expect(JSON.stringify(attributes)).not.toContain('private');
    const view = toAgentErrorView(readPiTerminalError(result)!);
    expect(view.failure).toMatchObject({
      reasonCode: 'quota',
      source: { layer: 'provider', code: 'RATE_LIMITED' },
      context: {
        statusCode: 429,
        responseBody: JSON.stringify({
          error: { code: 'insufficient_quota', type: 'rate_limit_error' },
        }),
      },
    });
    expect(JSON.stringify(view)).not.toContain('private');
  } finally {
    await runtime._doStop();
  }
});
