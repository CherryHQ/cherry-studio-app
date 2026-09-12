import type { LanguageModelV3ToolCall } from '@ai-sdk/provider';
import { generateText } from '@cherrystudio/ai-core';
import { InvalidToolInputError, NoSuchToolError } from 'ai';

import { createAiRepair } from '../repair';

vi.mock('@cherrystudio/ai-core', () => ({ generateText: vi.fn() }));
const mockGenerateText = vi.mocked(generateText);

const repair = createAiRepair({
  modelId: 'deepseek-flash',
  providerId: 'openai-compatible',
  providerSettings: { apiKey: 'test', baseURL: 'https://example.com', name: 'CherryExpress' },
});

describe('createAiRepair', () => {
  beforeEach(() => mockGenerateText.mockReset());

  test('repairs invalid input with the same provider and model', async () => {
    mockGenerateText.mockResolvedValue({ output: { query: 'fixed' } } as never);
    const result = await callRepair(
      new InvalidToolInputError({
        cause: new Error('query required'),
        toolInput: '{}',
        toolName: 'web_search',
      }),
    );

    expect(JSON.parse(result?.input ?? '{}')).toEqual({ query: 'fixed' });
    expect(mockGenerateText).toHaveBeenCalledWith(
      'openai-compatible',
      expect.objectContaining({ apiKey: 'test' }),
      expect.objectContaining({ model: 'deepseek-flash', output: expect.anything() }),
      undefined,
    );
  });

  test('does not repair unknown tool names', async () => {
    expect(await callRepair(new NoSuchToolError({ toolName: 'missing' }))).toBeNull();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  test('only injects plugins supplied by the usage plugin factory', async () => {
    const usagePlugins = [{ name: 'usage' }];
    const repairWithUsage = createAiRepair({
      getUsagePlugins: () => usagePlugins as never,
      modelId: 'deepseek-flash',
      providerId: 'openai-compatible',
      providerSettings: { apiKey: 'test', baseURL: 'https://example.com', name: 'CherryExpress' },
    });
    mockGenerateText.mockResolvedValue({ output: { query: 'fixed' } } as never);

    await callRepair(
      new InvalidToolInputError({
        cause: new Error('query required'),
        toolInput: '{}',
        toolName: 'web_search',
      }),
      repairWithUsage,
    );

    expect(mockGenerateText.mock.calls[0]?.[3]).toBe(usagePlugins);
  });

  test('reports a failed repair pipeline without surfacing the diagnostics path', async () => {
    const diagnostics = vi.fn();
    const repairWithDiagnostics = createAiRepair({
      diagnostics,
      getUsagePlugins: () => {
        throw new Error('usage context unavailable');
      },
      modelId: 'deepseek-flash',
      providerId: 'openai-compatible',
      providerSettings: { apiKey: 'test', baseURL: 'https://example.com', name: 'CherryExpress' },
    });
    mockGenerateText.mockResolvedValue({ output: { query: 'fixed' } } as never);

    await expect(
      callRepair(
        new InvalidToolInputError({
          cause: new Error('query required'),
          toolInput: '{}',
          toolName: 'web_search',
        }),
        repairWithDiagnostics,
      ),
    ).resolves.toBeNull();
    expect(diagnostics).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'tool-repair-failed', toolName: 'web_search' }),
    );
  });
});

function callRepair(error: InvalidToolInputError | NoSuchToolError, repairToolCall = repair) {
  return repairToolCall({
    error,
    inputSchema: async () => ({ properties: { query: { type: 'string' } }, type: 'object' }),
    messages: [],
    system: undefined,
    toolCall: {
      input: '{}',
      toolCallId: 'call-1',
      toolCallType: 'function',
      toolName: 'web_search',
      type: 'tool-call',
    } as LanguageModelV3ToolCall,
    tools: {},
  });
}
