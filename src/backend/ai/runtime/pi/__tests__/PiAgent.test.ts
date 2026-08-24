import { PiAgent } from '../PiAgent';

const mockSubscribe = jest.fn();
const mockPrompt = jest.fn();
let mockAgentOptions: Record<string, unknown> | undefined;

jest.mock('@mariozechner/pi-agent-core', () => ({
  Agent: class MockPiAgent {
    constructor(options: Record<string, unknown>) {
      mockAgentOptions = options;
    }

    abort() {}

    prompt = mockPrompt;
    subscribe = mockSubscribe;
  },
}));

jest.mock(
  '@mariozechner/pi-ai/openai-responses',
  () => ({ streamSimpleOpenAIResponses: jest.fn() }),
  { virtual: true },
);

describe('PiAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentOptions = undefined;
    mockSubscribe.mockImplementation((listener) => {
      mockPrompt.mockImplementation(async () => {
        listener({
          assistantMessageEvent: { contentIndex: 0, type: 'text_start' },
          type: 'message_update',
        });
        listener({
          assistantMessageEvent: { contentIndex: 0, delta: 'Luna works', type: 'text_delta' },
          type: 'message_update',
        });
        listener({
          assistantMessageEvent: { contentIndex: 0, type: 'text_end' },
          type: 'message_update',
        });
        listener({
          message: {
            api: 'openai-responses',
            content: [{ text: 'Luna works', type: 'text' }],
            model: 'gpt-5.6-luna',
            provider: 'test-provider',
            role: 'assistant',
            stopReason: 'stop',
            timestamp: 1,
            usage: {
              cacheRead: 3,
              cacheWrite: 0,
              cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
              input: 7,
              output: 2,
              totalTokens: 12,
            },
          },
          type: 'turn_end',
        });
      });
      return jest.fn();
    });
  });

  it('runs Luna through pi and projects stream chunks and usage', async () => {
    const chunks: unknown[] = [];
    const result = await new PiAgent({
      apiKey: 'test-key',
      baseUrl: 'https://example.com/',
      modelId: 'gpt-5.6-luna',
      providerName: 'test-provider',
    }).run({ prompt: 'Reply with Luna works' }, undefined, (chunk) => chunks.push(chunk));

    expect(result).toEqual({
      finishReason: 'stop',
      text: 'Luna works',
      usage: expect.objectContaining({ inputTokens: 10, outputTokens: 2, totalTokens: 12 }),
    });
    expect(chunks).toEqual([
      { id: 'pi-0', type: 'text-start' },
      { delta: 'Luna works', id: 'pi-0', type: 'text-delta' },
      { id: 'pi-0', type: 'text-end' },
    ]);
    expect(mockAgentOptions).toMatchObject({
      initialState: {
        model: {
          api: 'openai-responses',
          baseUrl: 'https://example.com/v1',
          id: 'gpt-5.6-luna',
        },
      },
    });
  });
});
