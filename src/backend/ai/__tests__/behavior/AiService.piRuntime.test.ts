import { ENDPOINT_TYPE, MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import { MockLanguageModelV3 } from 'ai/test';

import { AiService } from '@/backend/ai/AiService';
import { Agent } from '@/backend/ai/runtime/aiSdk';
import type { CherryUIMessage } from '@/shared/data/types/message';

import { collectStreamContract } from '../_harness/contracts';
import {
  installMockProvider,
  textGenerateResult,
  textStreamResult,
} from '../_harness/mockProvider';
import { createContractFixture } from '../_harness/services';

const mockPiStream = jest.fn();
const mockPiAdapter = jest.fn();

class MockPiChatStreamAdapter {
  constructor(options: unknown) {
    mockPiAdapter(options);
  }

  stream(...args: unknown[]) {
    return mockPiStream(...args);
  }
}

describe('AiService Pi chat runtime contract', () => {
  const originalRuntime = process.env.EXPO_PUBLIC_CHAT_RUNTIME;
  let restoreProvider: (() => void) | undefined;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_CHAT_RUNTIME = 'pi';
    mockPiAdapter.mockClear();
    mockPiStream.mockReset();
    mockPiStream.mockReturnValue(new ReadableStream());
  });

  afterEach(() => {
    restoreProvider?.();
    restoreProvider = undefined;
    if (originalRuntime === undefined) delete process.env.EXPO_PUBLIC_CHAT_RUNTIME;
    else process.env.EXPO_PUBLIC_CHAT_RUNTIME = originalRuntime;
    jest.restoreAllMocks();
  });

  test('maps the selected AI SDK provider, model, assistant, and transport config into Pi once', async () => {
    const fixture = createResponsesFixture();
    const controller = new AbortController();
    const messages = [userMessage('Use the configured model.')];
    const piOutput = new ReadableStream();
    mockPiStream.mockReturnValue(piOutput);

    const stream = await new AiService(fixture.services).streamText({
      assistantId: fixture.assistant.id,
      chatId: 'topic-pi-1',
      messageId: 'assistant-pi-1',
      messages,
      requestOptions: {
        headers: { 'X-Override': 'request', 'X-Request': 'request-value' },
        maxRetries: 3,
        signal: controller.signal,
        timeout: 12_345,
      },
      trigger: 'submit-message',
    });

    expect(stream).toBe(piOutput);
    expect(mockPiAdapter).toHaveBeenCalledTimes(1);
    expect(mockPiAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'contract-key',
        baseUrl: 'https://responses.contract.invalid/v1',
        contextWindow: 128_000,
        headers: expect.objectContaining({
          'X-Override': 'request',
          'X-Provider': 'provider-value',
          'X-Request': 'request-value',
        }),
        maxOutputTokens: 3_072,
        maxRetries: 3,
        messageId: 'assistant-pi-1',
        modelId: fixture.model.modelId,
        modelName: fixture.model.name,
        providerId: fixture.provider.id,
        providerName: fixture.provider.name,
        sessionId: 'topic-pi-1',
        supportsReasoning: true,
        system: 'Pi system prompt.',
        temperature: 0.25,
        thinkingLevel: 'high',
        timeoutMs: 12_345,
        usageCapture: expect.objectContaining({
          context: expect.objectContaining({
            messageRef: { id: 'assistant-pi-1', kind: 'chat' },
          }),
          recorder: fixture.services.aiUsageRecord,
        }),
      }),
    );
    expect(mockPiStream).toHaveBeenCalledWith(messages, controller.signal);
    expect(fixture.spies.resolveApiKey).toHaveBeenCalledTimes(1);
    expect(fixture.services.provider.getRotatedApiKey).not.toHaveBeenCalled();
  });

  test('does not fall back to AI SDK when Pi startup fails', async () => {
    const fixture = createResponsesFixture();
    const piError = new Error('Pi startup failed');
    mockPiStream.mockImplementation(() => {
      throw piError;
    });
    const aiSdkStream = jest.spyOn(Agent.prototype, 'stream');

    await expect(new AiService(fixture.services).streamText(streamRequest(fixture))).rejects.toBe(
      piError,
    );
    expect(aiSdkStream).not.toHaveBeenCalled();
    expect(mockPiAdapter).toHaveBeenCalledTimes(1);
  });

  test('rejects non-Responses endpoints and tool requests before constructing Pi', async () => {
    const chatCompletions = createContractFixture();
    await expect(
      new AiService(chatCompletions.services).streamText(streamRequest(chatCompletions)),
    ).rejects.toThrow(
      'Pi chat runtime only supports the OpenAI Responses endpoint; received openai-chat-completions',
    );

    const responses = createResponsesFixture();
    await expect(
      new AiService(responses.services).streamText({
        ...streamRequest(responses),
        callOverrides: { tools: { search: {} as never } },
      }),
    ).rejects.toThrow('Pi chat runtime does not support request tools in this transition stage');
    expect(mockPiAdapter).not.toHaveBeenCalled();
  });

  test('keeps AI SDK streaming active when the build flag selects it', async () => {
    process.env.EXPO_PUBLIC_CHAT_RUNTIME = 'ai-sdk';
    const fixture = createContractFixture();
    const languageModel = new MockLanguageModelV3({
      doStream: textStreamResult('AI SDK response.'),
      modelId: fixture.model.modelId,
      provider: fixture.provider.id,
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const output = await collectStreamContract(
      await new AiService(fixture.services).streamText(streamRequest(fixture)),
    );

    expect(output.finalMessage?.parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ text: 'AI SDK response.', type: 'text' })]),
    );
    expect(languageModel.doStreamCalls).toHaveLength(1);
    expect(mockPiAdapter).not.toHaveBeenCalled();
  });

  test('keeps generateText and model checks on AI SDK while Pi chat is selected', async () => {
    const fixture = createContractFixture();
    const languageModel = new MockLanguageModelV3({
      doGenerate: textGenerateResult('ok'),
      modelId: fixture.model.modelId,
      provider: fixture.provider.id,
    });
    restoreProvider = installMockProvider({ language: languageModel });
    const service = new AiService(fixture.services);

    await expect(
      service.generateText({ prompt: 'Generate a title.', uniqueModelId: fixture.model.id }),
    ).resolves.toMatchObject({ text: 'ok' });
    await expect(
      service.checkModel({ timeout: 1_000, uniqueModelId: fixture.model.id }),
    ).resolves.toMatchObject({ latency: expect.any(Number) });

    expect(languageModel.doGenerateCalls).toHaveLength(2);
    expect(mockPiAdapter).not.toHaveBeenCalled();
  });
});

function createResponsesFixture() {
  const fixture = createContractFixture({
    assistantPrompt: 'Pi system prompt.',
    assistantSettings: {
      enableMaxTokens: true,
      enableTemperature: true,
      maxTokens: 3_072,
      reasoning_effort: 'high',
      temperature: 0.25,
    },
    capabilities: [MODEL_CAPABILITY.REASONING],
    modelOverrides: {
      contextWindow: 128_000,
      endpointTypes: [ENDPOINT_TYPE.OPENAI_RESPONSES],
      maxOutputTokens: 8_192,
      parameterSupport: {
        maxTokens: true,
        stopSequences: true,
        systemMessage: true,
        temperature: { max: 2, min: 0, supported: true },
        topP: { max: 1, min: 0, supported: true },
      },
      reasoning: {
        defaultEffort: 'medium',
        selectableEfforts: ['none', 'low', 'medium', 'high'],
      },
    },
    providerOverrides: {
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_RESPONSES,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_RESPONSES]: {
          adapterFamily: 'openai',
          baseUrl: 'https://responses.contract.invalid/v1',
        },
      },
      settings: {
        extraHeaders: {
          'X-Override': 'provider',
          'X-Provider': 'provider-value',
        },
      },
    },
  });
  fixture.services.piChatRuntime = {
    load: jest.fn(async () => ({ PiChatStreamAdapter: MockPiChatStreamAdapter as never })),
  };
  return fixture;
}

function streamRequest(fixture: ReturnType<typeof createContractFixture>) {
  return {
    assistantId: fixture.assistant.id,
    chatId: 'topic-pi',
    messageId: 'assistant-pi',
    messages: [userMessage('Hello')],
    requestOptions: { signal: new AbortController().signal },
    trigger: 'submit-message' as const,
  };
}

function userMessage(text: string): CherryUIMessage {
  return { id: `user-${text}`, parts: [{ text, type: 'text' }], role: 'user' };
}
