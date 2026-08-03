import { createAgent } from '@cherrystudio/ai-core';
import type { UIMessageChunk } from 'ai';

import { Agent } from '../Agent';
import { markTrustedLocalToolTerminalFailure } from '../loop/localToolTerminalOutcome';
import { createToolCallLimitStopCondition } from '../loop/toolLoopTermination';

const mockGenerate = jest.fn(async () => ({ text: 'ok', usage: undefined }));
const testUsage = {
  inputTokenDetails: {},
  inputTokens: 1,
  outputTokenDetails: {},
  outputTokens: 2,
  totalTokens: 3,
};

jest.mock('@cherrystudio/ai-core', () => ({
  createAgent: jest.fn(async () => ({ generate: mockGenerate })),
}));

describe('Agent tool request wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes request context and repair through ToolLoopAgent settings', async () => {
    const context = { chatId: 'topic-1', requestId: 'request-1' };
    const repairToolCall = jest.fn();
    const agent = new Agent({
      context,
      modelId: 'deepseek-flash',
      providerId: 'openai-compatible',
      providerSettings: {
        apiKey: 'test',
        baseURL: 'https://example.com',
        name: 'CherryExpress',
      },
      repairToolCall,
      tools: {},
    });

    await agent.generate({ prompt: 'hello' });

    expect(createAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentSettings: expect.objectContaining({
          experimental_context: context,
          experimental_repairToolCall: repairToolCall,
        }),
      }),
    );
  });

  test('wraps tools with desktop-compatible execution timing hooks', async () => {
    const execute = jest.fn(async () => 'done');
    const onToolExecutionStart = jest.fn();
    const onToolExecutionEnd = jest.fn();
    const agent = new Agent({
      modelId: 'deepseek-flash',
      providerId: 'openai-compatible',
      providerSettings: {
        apiKey: 'test',
        baseURL: 'https://example.com',
        name: 'CherryExpress',
      },
      toolExecutionHooks: { onToolExecutionStart, onToolExecutionEnd },
      tools: { search: { execute } as never },
    });

    await agent.generate({ prompt: 'hello' });
    const wrappedTool = (createAgent as jest.Mock).mock.calls.at(-1)?.[0].agentSettings.tools
      .search;
    await wrappedTool.execute({ query: 'Cherry Studio' }, { messages: [], toolCallId: 'call-1' });

    expect(execute).toHaveBeenCalled();
    expect(onToolExecutionStart).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'call-1', toolName: 'search' }),
    );
    expect(onToolExecutionEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'call-1',
        toolName: 'search',
        toolOutput: { type: 'tool-result', output: 'done' },
      }),
    );
  });

  test('routes a trusted terminal tool failure through onError', async () => {
    const output = markTrustedLocalToolTerminalFailure({
      error: 'terminal failure',
      i18nKey: 'web_search_provider_unavailable',
      retryable: false as const,
      terminal: true as const,
      userMessage: 'Fix the configuration.',
    });
    (createAgent as jest.Mock).mockResolvedValueOnce({
      generate: jest.fn(async () => ({
        steps: [{ toolResults: [{ output, providerExecuted: false }] }],
        text: '',
        usage: testUsage,
      })),
    });
    const onError = jest.fn(() => 'abort' as const);
    const onFinish = jest.fn();
    const agent = new Agent({
      hookParts: [{ onError, onFinish }],
      modelId: 'test-model',
      providerId: 'openai-compatible',
      providerSettings: { apiKey: 'test', baseURL: 'https://example.com', name: 'test' },
    });

    await expect(agent.generate({ prompt: 'hello' })).rejects.toMatchObject({
      i18nKey: 'web_search_provider_unavailable',
      message: 'Fix the configuration.',
      name: 'ToolLoopTerminalError',
    });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFinish).not.toHaveBeenCalled();
  });

  test('turns a triggered tool-call cap into an error', async () => {
    const steps = [{ toolResults: [] }, { toolResults: [] }];
    const stopWhen = createToolCallLimitStopCondition(2);
    await stopWhen({ steps: steps as never });
    (createAgent as jest.Mock).mockResolvedValueOnce({
      generate: jest.fn(async () => ({ steps, text: '', usage: testUsage })),
    });
    const agent = new Agent({
      modelId: 'test-model',
      options: { stopWhen },
      providerId: 'openai-compatible',
      providerSettings: { apiKey: 'test', baseURL: 'https://example.com', name: 'test' },
    });

    await expect(agent.generate({ prompt: 'hello' })).rejects.toMatchObject({
      i18nKey: 'tool_call_limit_reached',
      name: 'ToolLoopTerminalError',
    });
  });

  test('preserves the original terminal provider error after an earlier tool error', async () => {
    const toolError = new Error('Invalid tool input');
    const providerError = new Error('Upstream unavailable');
    (createAgent as jest.Mock).mockResolvedValueOnce({
      stream: jest.fn(async () => ({
        steps: Promise.resolve([]),
        toUIMessageStream: (options: { onError: (error: unknown) => string }) => {
          const toolErrorText = options.onError(toolError);
          const providerErrorText = options.onError(providerError);
          return new ReadableStream<UIMessageChunk>({
            start(controller) {
              controller.enqueue({
                errorText: toolErrorText,
                input: {},
                toolCallId: 'tool-1',
                toolName: 'search',
                type: 'tool-input-error',
              } as UIMessageChunk);
              controller.enqueue({ type: 'error', errorText: providerErrorText });
            },
          });
        },
      })),
    });
    const agent = new Agent({
      modelId: 'test-model',
      providerId: 'openai-compatible',
      providerSettings: { apiKey: 'test', baseURL: 'https://example.com', name: 'test' },
    });
    const reader = agent.stream([], new AbortController().signal).getReader();

    await expect(reader.read()).resolves.toMatchObject({
      done: false,
      value: { type: 'tool-input-error' },
    });
    await expect(reader.read()).rejects.toBe(providerError);
  });
});
