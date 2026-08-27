import { createAgent } from '@cherrystudio/ai-core';
import {
  createToolCallLimitStopCondition,
  markTrustedLocalToolTerminalFailure,
} from '@cherrystudio/ai-runtime/runtime';

import { AiSdkGenerator } from '../AiSdkGenerator';

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

describe('AiSdkGenerator tool request wiring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes request context and repair through ToolLoopAgent settings', async () => {
    const context = { requestId: 'request-1' };
    const repairToolCall = jest.fn();
    const generator = new AiSdkGenerator({
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

    await generator.generate({ prompt: 'hello' });

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
    const generator = new AiSdkGenerator({
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

    await generator.generate({ prompt: 'hello' });
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

  test('surfaces a trusted terminal tool failure', async () => {
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
    const generator = new AiSdkGenerator({
      modelId: 'test-model',
      providerId: 'openai-compatible',
      providerSettings: { apiKey: 'test', baseURL: 'https://example.com', name: 'test' },
    });

    await expect(generator.generate({ prompt: 'hello' })).rejects.toMatchObject({
      i18nKey: 'web_search_provider_unavailable',
      message: 'Fix the configuration.',
      name: 'ToolLoopTerminalError',
    });
  });

  test('turns a triggered tool-call cap into an error', async () => {
    const steps = [{ toolResults: [] }, { toolResults: [] }];
    const stopWhen = createToolCallLimitStopCondition(2);
    await stopWhen({ steps: steps as never });
    (createAgent as jest.Mock).mockResolvedValueOnce({
      generate: jest.fn(async () => ({ steps, text: '', usage: testUsage })),
    });
    const generator = new AiSdkGenerator({
      modelId: 'test-model',
      options: { stopWhen },
      providerId: 'openai-compatible',
      providerSettings: { apiKey: 'test', baseURL: 'https://example.com', name: 'test' },
    });

    await expect(generator.generate({ prompt: 'hello' })).rejects.toMatchObject({
      i18nKey: 'tool_call_limit_reached',
      name: 'ToolLoopTerminalError',
    });
  });
});
