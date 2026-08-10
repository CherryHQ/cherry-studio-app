import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { CherryUIMessage } from '@cherrystudio/universal/data/types/message';
import { MockLanguageModelV3 } from 'ai/test';
import * as Crypto from 'expo-crypto';

import { AiService } from '@/backend/ai/AiService';

import {
  collectStreamContract,
  projectContractValue,
  projectLanguageCall,
} from '../_harness/contracts';
import { installMockProvider, textStreamResult } from '../_harness/mockProvider';
import { createContractFixture } from '../_harness/services';

jest.mock('expo/fetch', () => ({
  fetch: jest.fn(async () => {
    throw new Error('Unexpected expo.fetch call in AI SDK contract test');
  }),
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    readonly type = 'image/png';

    async base64() {
      return 'iVBORw0KGgo=';
    }
  },
}));

describe('AiService.streamText AI SDK contract', () => {
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

  test('projects a plain model stream into stable chunks, final message, and usage', async () => {
    const fixture = createContractFixture();
    const languageModel = new MockLanguageModelV3({
      doStream: textStreamResult('Hello from the contract model.'),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const stream = await new AiService(fixture.services).streamText({
      assistantId: fixture.assistant.id,
      chatId: 'topic-1',
      messageId: 'assistant-message-1',
      messages: [userMessage('Hello')],
      requestOptions: { signal: new AbortController().signal },
      trigger: 'submit-message',
    });
    const output = await collectStreamContract(stream);

    expect(projectLanguageCall(languageModel.doStreamCalls[0])).toMatchSnapshot('plain model call');
    expect(projectContractValue(output)).toMatchSnapshot('plain stream output');
    expect(output.finalMessage).toMatchObject({
      id: 'assistant-message-1',
      metadata: {
        completionTokens: 5,
        promptTokens: 10,
        thoughtsTokens: 1,
        totalTokens: 15,
      },
      parts: expect.arrayContaining([
        {
          providerMetadata: undefined,
          state: 'done',
          text: 'Hello from the contract model.',
          type: 'text',
        },
      ]),
      role: 'assistant',
    });
    expect(fixture.spies.recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          messageRef: { id: 'assistant-message-1', kind: 'chat' },
        }),
        modality: 'language',
        usage: expect.objectContaining({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
      }),
    );
  });

  test('preserves rich input and resolves a managed attachment before the model boundary', async () => {
    const fixture = createContractFixture({
      assistantPrompt: 'Answer from the supplied evidence.',
      capabilities: [MODEL_CAPABILITY.IMAGE_RECOGNITION],
      fileUri: 'file:///contract/image.png',
      modelOverrides: {
        parameterSupport: {
          maxTokens: true,
          stopSequences: true,
          systemMessage: true,
          temperature: { max: 2, min: 0, supported: true },
          topP: { max: 1, min: 0, supported: true },
        },
      },
    });
    const languageModel = new MockLanguageModelV3({
      doStream: textStreamResult('The image contains a cherry.'),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const message: CherryUIMessage = {
      id: 'user-message-1',
      parts: [
        { text: 'What is shown?', type: 'text' },
        {
          filename: 'image.png',
          mediaType: 'image/png',
          providerMetadata: { cherry: { fileEntryId: 'file-entry-1' } },
          type: 'file',
          url: 'file:///stale/image.png',
        },
      ],
      role: 'user',
    };

    const stream = await new AiService(fixture.services).streamText({
      assistantId: fixture.assistant.id,
      callOverrides: {
        maxOutputTokens: 256,
        stopSequences: ['END'],
        temperature: 0.3,
        topP: 0.8,
      },
      chatId: 'topic-1',
      messageId: 'assistant-message-2',
      messages: [message],
      requestOptions: {
        headers: { 'X-Contract': 'rich-input' },
        signal: new AbortController().signal,
      },
      trigger: 'submit-message',
    });
    await collectStreamContract(stream);

    expect(fixture.spies.getFileUri).toHaveBeenCalledWith('file-entry-1');
    expect(projectLanguageCall(languageModel.doStreamCalls[0])).toMatchSnapshot('rich model call');
    expect(languageModel.doStreamCalls[0]).toMatchObject({
      headers: { 'X-Contract': 'rich-input' },
      maxOutputTokens: 256,
      stopSequences: ['END'],
      temperature: 0.3,
      topP: 0.8,
    });
  });

  test('rejects before creating a model stream when no abort signal is supplied', async () => {
    const fixture = createContractFixture();

    await expect(
      new AiService(fixture.services).streamText({
        assistantId: fixture.assistant.id,
        chatId: 'topic-1',
        messages: [],
        trigger: 'submit-message',
      }),
    ).rejects.toThrow('streamText requires requestOptions.signal');
  });
});

function userMessage(text: string): CherryUIMessage {
  return {
    id: 'user-message-1',
    parts: [{ text, type: 'text' }],
    role: 'user',
  };
}
