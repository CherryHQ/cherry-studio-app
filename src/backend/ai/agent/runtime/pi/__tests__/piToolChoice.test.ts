import path from 'node:path';

import type {
  Context,
  Model as PiModel,
  SimpleStreamOptions,
  StreamFunction,
} from '@earendil-works/pi-ai';

import type { SupportedPiApi } from '../piApiAdapters';
import { disablePiToolCalls } from '../piToolChoice';

const CASES: { api: SupportedPiApi; expected: Record<string, unknown> }[] = [
  {
    api: 'anthropic-messages',
    expected: {
      tools: [expect.objectContaining({ name: 'lookup' })],
      tool_choice: { type: 'none' },
      messages: expect.arrayContaining([
        expect.objectContaining({ content: [expect.objectContaining({ type: 'tool_use' })] }),
        expect.objectContaining({ content: [expect.objectContaining({ type: 'tool_result' })] }),
      ]),
    },
  },
  {
    api: 'openai-completions',
    expected: {
      tools: [expect.objectContaining({ function: expect.objectContaining({ name: 'lookup' }) })],
      tool_choice: 'none',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'tool', content: 'Collected evidence' }),
      ]),
    },
  },
  {
    api: 'openai-responses',
    expected: {
      tools: [expect.objectContaining({ name: 'lookup' })],
      tool_choice: 'none',
      input: expect.arrayContaining([
        expect.objectContaining({ type: 'function_call_output', output: 'Collected evidence' }),
      ]),
    },
  },
  {
    api: 'google-generative-ai',
    expected: {
      config: {
        tools: [
          expect.objectContaining({
            functionDeclarations: [expect.objectContaining({ name: 'lookup' })],
          }),
        ],
        toolConfig: { functionCallingConfig: { mode: 'NONE' } },
        systemInstruction: 'Answer from the evidence.',
      },
      contents: expect.arrayContaining([
        expect.objectContaining({
          parts: [
            expect.objectContaining({
              functionResponse: expect.objectContaining({ name: 'lookup' }),
            }),
          ],
        }),
      ]),
    },
  },
];

describe('Pi final response tool choice', () => {
  test.each(CASES)(
    'retains tool history and disables calls in the serialized $api request',
    async ({ api, expected }) => {
      // Load the installed adapter, including its simple-options mapping. Intercept
      // serialization before transport so this regression never contacts a provider.
      const { streamSimple } = jest.requireActual<{
        streamSimple: StreamFunction<SupportedPiApi, SimpleStreamOptions>;
      }>(path.join(process.cwd(), `node_modules/@earendil-works/pi-ai/dist/api/${api}.js`));
      const model: PiModel<SupportedPiApi> = {
        api,
        baseUrl: 'https://provider.example',
        contextWindow: 128_000,
        cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
        id: 'test-model',
        input: ['text'],
        maxTokens: 4096,
        name: 'Test model',
        provider: 'test-provider',
        reasoning: false,
      };
      const context: Context = {
        systemPrompt: 'Answer from the evidence.',
        tools: [
          {
            name: 'lookup',
            description: 'Find evidence.',
            parameters: { type: 'object', properties: {} } as never,
          },
        ],
        messages: [
          { role: 'user', content: 'Look up the answer.', timestamp: 1 },
          {
            api,
            model: model.id,
            provider: model.provider,
            role: 'assistant',
            content: [{ type: 'toolCall', id: 'lookup_1', name: 'lookup', arguments: {} }],
            stopReason: 'toolUse',
            timestamp: 2,
            usage: {
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 2,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          },
          {
            role: 'toolResult',
            toolCallId: 'lookup_1',
            toolName: 'lookup',
            content: [{ type: 'text', text: 'Collected evidence' }],
            isError: false,
            timestamp: 3,
          },
        ],
      };
      let captured: unknown;
      const stream = streamSimple(model, context, {
        apiKey: 'test-key',
        onPayload: (payload) => {
          captured = disablePiToolCalls(payload, api);
          throw new Error('Request captured before transport.');
        },
      });
      const result = await stream.result();

      expect(result.stopReason).toBe('error');
      expect(result.errorMessage).toContain('Request captured before transport.');
      expect(captured).toMatchObject(expected);
      expect(context.tools).toHaveLength(1);
    },
  );
});
