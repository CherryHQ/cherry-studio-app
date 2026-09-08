import type { ModelMessage } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import * as Crypto from 'expo-crypto';

import { AiService } from '@/backend/ai/AiService';
import { createTraceRecorder } from '@/backend/ai/observability/__tests__/_traceRecorder';

import { projectContractValue, projectLanguageCall } from '../_harness/contracts';
import { installMockProvider, textGenerateResult } from '../_harness/mockProvider';
import { createContractFixture } from '../_harness/services';

jest.mock('expo/fetch', () => ({
  fetch: jest.fn(async () => {
    throw new Error('Unexpected expo.fetch call in AI SDK contract test');
  }),
}));

describe('AiService.generateText AI SDK contract', () => {
  let restoreProvider: (() => void) | undefined;

  beforeEach(() => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected fetch call in AI SDK contract test'));
    jest.spyOn(Crypto, 'randomUUID').mockReturnValue('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    restoreProvider?.();
    restoreProvider = undefined;
    jest.restoreAllMocks();
  });

  test('uses the explicit system prompt and returns text with recorded usage', async () => {
    const { traces, records } = createTraceRecorder();
    const fixture = createContractFixture();
    const languageModel = new MockLanguageModelV3({
      doGenerate: textGenerateResult('Contract title'),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });

    const result = await new AiService(traces, fixture.services).generateText({
      prompt: 'Name this conversation.',
      system: 'Return a short title.',
      uniqueModelId: fixture.model.id,
    });

    expect(projectLanguageCall(languageModel.doGenerateCalls[0])).toMatchSnapshot('prompt call');
    expect(projectContractValue(result)).toMatchSnapshot('prompt result');
    expect(result.text).toBe('Contract title');
    expect(records.filter((record) => record.revision === 2)).toEqual([
      expect.objectContaining({
        name: 'ai.sdk.generate',
        status: 'ok',
        attributes: expect.objectContaining({
          'gen_ai.usage.input_tokens': 10,
          'gen_ai.usage.output_tokens': 5,
        }),
      }),
      expect.objectContaining({ name: 'ai.generate_text', status: 'ok' }),
    ]);
    expect(JSON.stringify(records)).not.toMatch(
      /Contract title|Name this conversation|Return a short title/,
    );
    expect(fixture.spies.recordInvocation).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ messageRef: null }),
        modality: 'language',
        usage: expect.objectContaining({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
      }),
    );
  });

  test('passes model messages when no prompt string is supplied', async () => {
    const fixture = createContractFixture();
    const languageModel = new MockLanguageModelV3({
      doGenerate: textGenerateResult('Summary'),
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });
    const messages: ModelMessage[] = [
      { content: [{ text: 'Question', type: 'text' }], role: 'user' },
      { content: [{ text: 'Answer', type: 'text' }], role: 'assistant' },
      { content: [{ text: 'Summarize', type: 'text' }], role: 'user' },
    ];

    await new AiService(undefined, fixture.services).generateText({
      messages,
      uniqueModelId: fixture.model.id,
    });

    expect(projectLanguageCall(languageModel.doGenerateCalls[0])).toMatchSnapshot('messages call');
  });

  test('preserves model failures and rejects pre-aborted requests without calling the model', async () => {
    const { traces, records } = createTraceRecorder();
    const fixture = createContractFixture();
    const modelError = new Error('generation failed');
    const languageModel = new MockLanguageModelV3({
      doGenerate: async () => {
        throw modelError;
      },
      modelId: fixture.model.modelId,
      provider: 'contract-provider',
    });
    restoreProvider = installMockProvider({ language: languageModel });
    const service = new AiService(traces, fixture.services);

    await expect(
      service.generateText({ prompt: 'Fail', uniqueModelId: fixture.model.id }),
    ).rejects.toBe(modelError);

    const controller = new AbortController();
    const abortReason = new Error('cancelled before generate');
    controller.abort(abortReason);
    await expect(
      service.generateText({
        prompt: 'Do not run',
        requestOptions: { signal: controller.signal },
        uniqueModelId: fixture.model.id,
      }),
    ).rejects.toBe(abortReason);
    expect(languageModel.doGenerateCalls).toHaveLength(1);
    expect(
      records
        .filter((record) => record.parentSpanId === null && record.revision === 2)
        .map((record) => record.status),
    ).toEqual(['error', 'cancelled']);
    expect(JSON.stringify(records)).not.toContain('generation failed');
  });
});
