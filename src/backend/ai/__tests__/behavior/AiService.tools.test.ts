import type { LanguageModelV3CallOptions } from '@ai-sdk/provider';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { dynamicTool, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import * as Crypto from 'expo-crypto';
import * as z from 'zod';

import { AiService } from '@/backend/ai/AiService';
import type { ToolEntry } from '@/backend/ai/tools/adapters/aiSdk/types';

import {
  collectStreamContract,
  projectContractValue,
  projectLanguageCall,
} from '../_harness/contracts';
import {
  installMockProvider,
  streamSequence,
  textStreamResult,
  toolCallStreamResult,
} from '../_harness/mockProvider';
import { createContractFixture } from '../_harness/services';

jest.mock('expo/fetch', () => ({
  fetch: jest.fn(async () => {
    throw new Error('Unexpected expo.fetch call in AI SDK contract test');
  }),
}));

describe('AiService tool AI SDK contract', () => {
  let restoreProvider: (() => void) | undefined;

  beforeEach(() => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected fetch call in AI SDK contract test'));
    jest.spyOn(Crypto, 'randomUUID').mockReturnValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  afterEach(() => {
    restoreProvider?.();
    restoreProvider = undefined;
    jest.restoreAllMocks();
  });

  test('executes a local tool, forwards timing, and sends the result into the second model call', async () => {
    const fixture = createContractFixture({ capabilities: [MODEL_CAPABILITY.FUNCTION_CALL] });
    const languageModel = new MockLanguageModelV3({
      doStream: streamSequence(
        toolCallStreamResult({ args: { city: 'Shanghai' }, toolName: 'weather' }),
        textStreamResult('Shanghai is sunny.'),
      ),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });
    const execute = jest.fn(async ({ city }: { city: string }) => ({ city, condition: 'sunny' }));
    const runtimeTimingSink = {
      onToolExecutionEnd: jest.fn(),
      onToolExecutionStart: jest.fn(),
    };

    const stream = await new AiService(fixture.services).streamText({
      assistantId: fixture.assistant.id,
      callOverrides: {
        tools: {
          weather: tool({
            description: 'Get the current weather for a city.',
            execute,
            inputSchema: z.object({ city: z.string() }),
          }),
        },
      },
      chatId: 'topic-1',
      messageId: 'assistant-message-tool',
      messages: [userMessage('What is the weather?')],
      requestOptions: { signal: new AbortController().signal },
      runtimeTimingSink,
      trigger: 'submit-message',
    });
    const output = await collectStreamContract(stream);

    expect(execute).toHaveBeenCalledWith(
      { city: 'Shanghai' },
      expect.objectContaining({ toolCallId: 'tool-call-1' }),
    );
    expect(runtimeTimingSink.onToolExecutionStart).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'tool-call-1',
        input: { city: 'Shanghai' },
        toolName: 'weather',
      }),
    );
    expect(runtimeTimingSink.onToolExecutionEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: 'tool-call-1',
        toolName: 'weather',
        toolOutput: { output: { city: 'Shanghai', condition: 'sunny' }, type: 'tool-result' },
      }),
    );
    expect(runtimeTimingSink.onToolExecutionStart.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeTimingSink.onToolExecutionEnd.mock.invocationCallOrder[0],
    );
    expect(languageModel.doStreamCalls).toHaveLength(2);
    expect(languageModel.doStreamCalls.map(projectLanguageCall)).toMatchSnapshot(
      'successful local tool model calls',
    );
    expect(projectContractValue(output)).toMatchSnapshot('successful local tool output');
  });

  test('returns a local tool exception to the model and still accepts its final answer', async () => {
    const fixture = createContractFixture({ capabilities: [MODEL_CAPABILITY.FUNCTION_CALL] });
    const languageModel = new MockLanguageModelV3({
      doStream: streamSequence(
        toolCallStreamResult({ args: { query: 'status' }, toolName: 'unstable' }),
        textStreamResult('The tool failed, so no status is available.'),
      ),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });
    const toolError = new Error('tool unavailable');

    const stream = await new AiService(fixture.services).streamText({
      assistantId: fixture.assistant.id,
      callOverrides: {
        tools: {
          unstable: tool({
            execute: async (_input: { query: string }): Promise<string> => {
              throw toolError;
            },
            inputSchema: z.object({ query: z.string() }),
          }),
        },
      },
      chatId: 'topic-1',
      messageId: 'assistant-message-error',
      messages: [userMessage('Check the status.')],
      requestOptions: { signal: new AbortController().signal },
      trigger: 'submit-message',
    });
    const output = await collectStreamContract(stream);

    expect(languageModel.doStreamCalls).toHaveLength(2);
    expect(projectLanguageCall(languageModel.doStreamCalls[1])).toMatchSnapshot(
      'tool error second model call',
    );
    expect(output.chunks).toContainEqual(
      expect.objectContaining({ errorText: 'tool unavailable', type: 'tool-output-error' }),
    );
    expect(output.finalMessage).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          text: 'The tool failed, so no status is available.',
          type: 'text',
        }),
      ]),
    });
  });

  test('materializes and executes an injected MCP tool through the real ToolResolver', async () => {
    const execute = jest.fn(async (input: unknown) => {
      const { path } = z.object({ path: z.string() }).parse(input);
      return `contents:${path}`;
    });
    const mcpEntry: ToolEntry = {
      defer: 'never',
      description: 'Read a file through MCP.',
      name: 'mcp__files__read',
      namespace: 'mcp:Files',
      tool: dynamicTool({
        description: 'Read a file through MCP.',
        execute,
        inputSchema: z.object({ path: z.string() }),
        metadata: { cherry: { tool: { serverId: 'files', serverName: 'Files', type: 'mcp' } } },
      }),
    };
    const fixture = createContractFixture({
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
      mcpEntries: [mcpEntry],
    });
    const languageModel = new MockLanguageModelV3({
      doStream: streamSequence(
        toolCallStreamResult({ args: { path: 'README.md' }, toolName: mcpEntry.name }),
        textStreamResult('The file was read.'),
      ),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const stream = await new AiService(fixture.services).streamText({
      assistantId: fixture.assistant.id,
      chatId: 'topic-1',
      mcpToolIds: ['files::read'],
      messageId: 'assistant-message-mcp',
      messages: [userMessage('Read the README.')],
      requestOptions: { signal: new AbortController().signal },
      trigger: 'submit-message',
    });
    const output = await collectStreamContract(stream);

    expect(fixture.spies.getToolEntriesForAssistant).toHaveBeenCalledWith(fixture.assistant, [
      'files::read',
    ]);
    expect(execute).toHaveBeenCalledWith(
      { path: 'README.md' },
      expect.objectContaining({ toolCallId: 'tool-call-1' }),
    );
    expect(languageModel.doStreamCalls).toHaveLength(2);
    expect(languageModel.doStreamCalls.map(projectLanguageCall)).toMatchSnapshot('MCP model calls');
    expect(projectContractValue(output.finalMessage)).toMatchSnapshot('MCP final message');
  });

  test('returns agentic web search citations through the tool loop', async () => {
    const fixture = createContractFixture({
      assistantSettings: { enableWebSearch: true },
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    });
    const languageModel = new MockLanguageModelV3({
      doStream: async (options) => {
        const citationId = findWebSearchCitationId(options);
        return citationId
          ? textStreamResult(`Cherry Studio is on mobile.[cite:${citationId}]`)
          : toolCallStreamResult({
              args: { query: 'Cherry Studio current release' },
              toolName: 'web_search',
            });
      },
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const stream = await new AiService(fixture.services).streamText({
      assistantId: fixture.assistant.id,
      chatId: 'topic-1',
      messageId: 'assistant-message-search',
      messages: [userMessage('Is Cherry Studio available on mobile?')],
      requestOptions: { signal: new AbortController().signal },
      trigger: 'submit-message',
    });
    const output = await collectStreamContract(stream);

    expect(fixture.spies.searchKeywords).toHaveBeenCalledWith(
      { keywords: ['Cherry Studio current release'] },
      { signal: expect.any(AbortSignal) },
    );
    expect(projectLanguageCall(languageModel.doStreamCalls[0])).toMatchSnapshot(
      'web search first model call',
    );
    expect(projectLanguageCall(languageModel.doStreamCalls[1])).toMatchSnapshot(
      'web search second model call',
    );
    const searchChunk = output.chunks.find((chunk) => chunk.type === 'tool-output-available');
    expect(searchChunk).toMatchObject({
      output: [expect.objectContaining({ url: 'https://example.com/cherry' })],
    });
    const searchOutput = searchChunk?.output;
    if (!Array.isArray(searchOutput) || typeof searchOutput[0]?.id !== 'string') {
      throw new Error('Expected web_search to return a citation result');
    }
    const citationId = searchOutput[0].id;
    expect(output.finalMessage).toMatchObject({
      parts: expect.arrayContaining([
        expect.objectContaining({
          text: `Cherry Studio is on mobile.[cite:${citationId}]`,
          type: 'text',
        }),
      ]),
    });
  });
});

function userMessage(text: string) {
  return {
    id: 'user-message-1',
    parts: [{ text, type: 'text' as const }],
    role: 'user' as const,
  };
}

function findWebSearchCitationId(options: LanguageModelV3CallOptions): string | undefined {
  for (const message of options.prompt) {
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (
        part.type !== 'tool-result' ||
        part.toolName !== 'web_search' ||
        part.output.type !== 'json' ||
        !Array.isArray(part.output.value)
      ) {
        continue;
      }
      const first = part.output.value[0];
      if (
        typeof first === 'object' &&
        first !== null &&
        !Array.isArray(first) &&
        typeof first.id === 'string'
      ) {
        return first.id;
      }
    }
  }
  return undefined;
}
