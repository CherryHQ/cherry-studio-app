import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { AgentOptions } from '@earendil-works/pi-agent-core/agent';
import type { Context, FetchFunction, Model as PiModel } from '@earendil-works/pi-ai';

import { bindPiStream, resolvePiApiAdapter, type SupportedPiApi } from '../piApiAdapters';
import type { PiLanguageEndpointType } from '../piLanguageBinding';

const mockAnthropicStreamSimple = jest.fn();
const mockGoogleStreamSimple = jest.fn();
const mockOpenAiCompletionsStreamSimple = jest.fn();
const mockOpenAiResponsesStreamSimple = jest.fn();

const mockStreamResult = { id: 'stream' };
const mockFetch = jest.fn() as unknown as FetchFunction;
const context: Context = { messages: [] };

const CASES: {
  api: SupportedPiApi;
  baseUrl: string;
  endpointType: PiLanguageEndpointType;
  expectedBaseUrl: string;
  expectedFetch: FetchFunction | undefined;
  streamSimple: jest.Mock;
}[] = [
  {
    api: 'openai-responses',
    baseUrl: 'https://api.openai.test',
    endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
    expectedBaseUrl: 'https://api.openai.test/v1',
    expectedFetch: mockFetch,
    streamSimple: mockOpenAiResponsesStreamSimple,
  },
  {
    api: 'openai-completions',
    baseUrl: 'https://api.compat.test',
    endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    expectedBaseUrl: 'https://api.compat.test/v1',
    expectedFetch: mockFetch,
    streamSimple: mockOpenAiCompletionsStreamSimple,
  },
  {
    api: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.test/v1',
    endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
    expectedBaseUrl: 'https://api.anthropic.test',
    expectedFetch: mockFetch,
    streamSimple: mockAnthropicStreamSimple,
  },
  {
    api: 'google-generative-ai',
    baseUrl: 'https://api.google.test',
    endpointType: ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT,
    expectedBaseUrl: 'https://api.google.test/v1beta',
    expectedFetch: undefined,
    streamSimple: mockGoogleStreamSimple,
  },
];

describe('Pi API adapters', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    for (const testCase of CASES) testCase.streamSimple.mockReturnValue(mockStreamResult);
  });

  test.each(CASES)('binds $endpointType to $api', async (testCase) => {
    const adapter = resolvePiApiAdapter(testCase.endpointType);
    expect(adapter).toBeDefined();
    if (!adapter) throw new Error('Expected a supported Pi API adapter.');

    expect(adapter.api).toBe(testCase.api);
    expect(adapter.formatBaseUrl(testCase.baseUrl)).toBe(testCase.expectedBaseUrl);
    jest
      .spyOn(adapter, 'loadStreamSimple')
      .mockResolvedValue(testCase.streamSimple as unknown as AgentOptions['streamFn']);

    const streamFn = await bindPiStream(adapter, {
      apiKey: 'secret-key',
      fetch: mockFetch,
      headers: { 'X-App': 'Cherry' },
      maxRetries: 0,
      maxTokens: 2048,
      temperature: 0.2,
      timeoutMs: 60_000,
    });
    const model = { api: testCase.api } as PiModel<SupportedPiApi>;
    const signal = new AbortController().signal;
    const result = streamFn(model, context, {
      fetch: jest.fn() as unknown as FetchFunction,
      headers: { 'X-Request': 'request' },
      maxTokens: 32,
      reasoning: 'high',
      signal,
    });

    expect(result).toBe(mockStreamResult);
    expect(testCase.streamSimple).toHaveBeenCalledWith(
      model,
      context,
      expect.objectContaining({
        apiKey: 'secret-key',
        fetch: testCase.expectedFetch,
        headers: { 'X-App': 'Cherry', 'X-Request': 'request' },
        maxRetries: 0,
        maxTokens: 32,
        reasoning: 'high',
        signal,
        temperature: 0.2,
        timeoutMs: 60_000,
      }),
    );
  });
});
