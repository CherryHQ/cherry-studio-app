import type {
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { tool, type ToolSet, type UIMessageChunk } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import * as Crypto from 'expo-crypto';
import * as z from 'zod';

import { AiService } from '@/backend/ai/AiService';
import { WebSearchConfigError } from '@/backend/services/webSearch/WebSearchConfigError';

import { collectStreamContract } from '../_harness/contracts';
import { installMockProvider, toolCallStreamResult } from '../_harness/mockProvider';
import { createContractFixture } from '../_harness/services';

jest.mock('expo/fetch', () => ({
  fetch: jest.fn(async () => {
    throw new Error('Unexpected expo.fetch call in AI SDK contract test');
  }),
}));

describe('AiService terminal AI SDK contract', () => {
  let restoreProvider: (() => void) | undefined;

  beforeEach(() => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected fetch call in AI SDK contract test'));
    jest.spyOn(Crypto, 'randomUUID').mockReturnValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    restoreProvider?.();
    restoreProvider = undefined;
    jest.restoreAllMocks();
  });

  test('rejects the service promise when model resolution fails before Agent creation', async () => {
    const fixture = createContractFixture();

    await expect(
      new AiService(fixture.services).streamText({
        chatId: 'topic-1',
        messages: [],
        requestOptions: { signal: new AbortController().signal },
        trigger: 'submit-message',
        uniqueModelId: 'contract-provider::missing-model',
      }),
    ).rejects.toThrow('Cannot resolve model: contract-provider::missing-model');
  });

  test('preserves partial chunks and rejects the reader with the original model stream error', async () => {
    const fixture = createContractFixture();
    const providerError = new Error('provider stream failed');
    const languageModel = new MockLanguageModelV3({
      doStream: failingPartialStream(providerError),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const stream = await streamText(fixture, new AbortController());
    const outcome = await readUntilError(stream);

    expect(outcome.error).toBe(providerError);
    expect(outcome.chunks).toContainEqual({ delta: 'partial', id: 'text-1', type: 'text-delta' });
    expect(outcome.chunks).not.toContainEqual(expect.objectContaining({ type: 'finish' }));
  });

  test('closes cleanly after an in-flight abort without recording unfinished usage', async () => {
    const fixture = createContractFixture();
    const requestController = new AbortController();
    const abortReason = new Error('user cancelled');
    const languageModel = new MockLanguageModelV3({
      doStream: async (options) => abortablePartialStream(options),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const stream = await streamText(fixture, requestController);
    const reader = stream.getReader();
    const chunks: UIMessageChunk[] = [];
    while (!chunks.some((chunk) => chunk.type === 'text-delta')) {
      const next = await reader.read();
      if (next.done) throw new Error('stream closed before partial text');
      chunks.push(next.value);
    }
    requestController.abort(abortReason);
    const terminal = await reader.read();

    expect(terminal.done).toBe(true);
    expect(chunks).toContainEqual({ delta: 'partial', id: 'text-1', type: 'text-delta' });
    expect(chunks).not.toContainEqual(expect.objectContaining({ type: 'finish' }));
    expect(fixture.spies.recordInvocation).not.toHaveBeenCalled();
  });

  test('turns a permanent web-search configuration failure into a terminal stream error', async () => {
    const fixture = createContractFixture({
      assistantSettings: { enableWebSearch: true },
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    });
    fixture.spies.searchKeywords.mockRejectedValue(
      new WebSearchConfigError('provider_not_configured', 'search is not configured'),
    );
    const languageModel = new MockLanguageModelV3({
      doStream: toolCallStreamResult({
        args: { query: 'Cherry Studio current release' },
        toolName: 'web_search',
      }),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const outcome = await readUntilError(
      await streamText(fixture, new AbortController(), { messageId: 'assistant-search-error' }),
    );

    expect(outcome.error).toMatchObject({
      i18nKey: 'web_search_provider_unavailable',
      name: 'ToolLoopTerminalError',
    });
    expect(outcome.chunks).toContainEqual(
      expect.objectContaining({
        output: expect.objectContaining({ retryable: false, terminal: true }),
        type: 'tool-output-available',
      }),
    );
    expect(languageModel.doStreamCalls).toHaveLength(1);
  });

  test('turns the configured tool-call cap into a terminal stream error', async () => {
    const fixture = createContractFixture({
      assistantSettings: { enableMaxToolCalls: true, maxToolCalls: 1 },
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
    });
    const languageModel = new MockLanguageModelV3({
      doStream: toolCallStreamResult({ args: { value: 'one' }, toolName: 'repeat' }),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const outcome = await readUntilError(
      await streamText(fixture, new AbortController(), {
        tools: {
          repeat: tool({
            execute: async ({ value }) => value,
            inputSchema: z.object({ value: z.string() }),
          }),
        },
      }),
    );

    expect(outcome.error).toMatchObject({
      i18nKey: 'tool_call_limit_reached',
      name: 'ToolLoopTerminalError',
    });
    expect(languageModel.doStreamCalls).toHaveLength(1);
  });

  test('treats shouldYield at a tool step boundary as a clean stop', async () => {
    const fixture = createContractFixture({ capabilities: [MODEL_CAPABILITY.FUNCTION_CALL] });
    const languageModel = new MockLanguageModelV3({
      doStream: toolCallStreamResult({ args: { value: 'one' }, toolName: 'yielding' }),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const stream = await new AiService(fixture.services).streamText({
      assistantId: fixture.assistant.id,
      callOverrides: {
        tools: {
          yielding: tool({
            execute: async ({ value }) => value,
            inputSchema: z.object({ value: z.string() }),
          }),
        },
      },
      chatId: 'topic-1',
      messageId: 'assistant-yield',
      messages: [userMessage('Run once.')],
      requestOptions: { signal: new AbortController().signal },
      shouldYield: () => true,
      trigger: 'submit-message',
    });
    const output = await collectStreamContract(stream);

    expect(languageModel.doStreamCalls).toHaveLength(1);
    expect(output.chunks).toContainEqual(expect.objectContaining({ type: 'finish' }));
    expect(output.finalMessage?.parts).toContainEqual(
      expect.objectContaining({ state: 'output-available', type: 'tool-yielding' }),
    );
  });
});

function abortablePartialStream(options: LanguageModelV3CallOptions): LanguageModelV3StreamResult {
  return {
    stream: new ReadableStream<LanguageModelV3StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ id: 'text-1', type: 'text-start' });
        controller.enqueue({ delta: 'partial', id: 'text-1', type: 'text-delta' });
        options.abortSignal?.addEventListener(
          'abort',
          () => controller.error(options.abortSignal?.reason),
          { once: true },
        );
      },
    }),
  };
}

function failingPartialStream(error: Error): LanguageModelV3StreamResult {
  const chunks: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { id: 'text-1', type: 'text-start' },
    { delta: 'partial', id: 'text-1', type: 'text-delta' },
  ];
  let index = 0;
  return {
    stream: new ReadableStream<LanguageModelV3StreamPart>({
      pull(controller) {
        const chunk = chunks[index++];
        if (chunk) controller.enqueue(chunk);
        else controller.error(error);
      },
    }),
  };
}

async function readUntilError(stream: ReadableStream<UIMessageChunk>) {
  const reader = stream.getReader();
  const chunks: UIMessageChunk[] = [];
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return { chunks, error: undefined };
      chunks.push(next.value);
    }
  } catch (error) {
    return { chunks, error };
  }
}

function streamText(
  fixture: ReturnType<typeof createContractFixture>,
  controller: AbortController,
  overrides: { messageId?: string; tools?: ToolSet } = {},
) {
  return new AiService(fixture.services).streamText({
    assistantId: fixture.assistant.id,
    ...(overrides.tools ? { callOverrides: { tools: overrides.tools } } : {}),
    chatId: 'topic-1',
    messageId: overrides.messageId ?? 'assistant-terminal',
    messages: [userMessage('Run the contract.')],
    requestOptions: { signal: controller.signal },
    trigger: 'submit-message',
  });
}

function userMessage(text: string) {
  return {
    id: 'user-message-1',
    parts: [{ text, type: 'text' as const }],
    role: 'user' as const,
  };
}
