import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';

import type { Model as PiModel } from '@earendil-works/pi-ai';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import type { DbService } from '@/backend/data/db/DbService';
import { cloudSnapshot } from '@/backend/services/cloud/__tests__/_cloudFixtures';
import { CloudRuntime } from '@/backend/services/cloud/CloudRuntime';

import { bindPiStream, resolvePiApiAdapter, type SupportedPiApi } from '../piApiAdapters';

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
    async revoke() {}
  },
}));
jest.mock('@/backend/utils/defaultAppHeaders', () => ({ defaultAppHeaders: () => ({}) }));
jest.mock('@/backend/data/dataApiChanges', () => ({ publishDataApiChanges: jest.fn() }));

function reply(account: string, path: string) {
  const state = cloudSnapshot(account);
  if (path === '/api/v1/account') return state.account;
  if (path === '/api/v1/account/plans') return state.plans;
  if (path === '/v1/models') return { data: state.models };
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
  async ({ endpoint, first, last }) => {
    mockGet.mockImplementation(async (account: string, path: string) =>
      path === '/v1/models'
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
