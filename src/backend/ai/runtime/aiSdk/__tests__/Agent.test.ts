import { createAgent } from '@cherrystudio/ai-core';

import { Agent } from '../Agent';

const mockGenerate = jest.fn(async () => ({ text: 'ok', usage: undefined }));

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
});
