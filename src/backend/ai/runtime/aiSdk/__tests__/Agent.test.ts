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
});
