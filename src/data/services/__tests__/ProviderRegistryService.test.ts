import { ENDPOINT_TYPE, MODEL_CAPABILITY, REASONING_EFFORT } from '@cherrystudio/provider-registry';

import { extractReasoningFormatTypes, mergePresetModel } from '../ProviderRegistryService';

describe('provider-registry-service', () => {
  test('extracts typed reasoning formats from endpoint configs', () => {
    expect(
      extractReasoningFormatTypes({
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: { reasoningFormatType: 'openai-chat' },
        [ENDPOINT_TYPE.OPENAI_RESPONSES]: { reasoningFormatType: 'not-a-format' },
      }),
    ).toEqual({
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'openai-chat',
    });
  });

  test('merges preset model and provider override into runtime model', () => {
    const model = mergePresetModel(
      {
        capabilities: [MODEL_CAPABILITY.FUNCTION_CALL],
        contextWindow: 128000,
        id: 'gpt-4o',
        maxOutputTokens: 16384,
        metadata: {},
        name: 'GPT-4o',
        pricing: {
          input: { perMillionTokens: 2.5 },
          output: { perMillionTokens: 10 },
        },
        reasoning: {
          supportedEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
        },
      },
      {
        capabilities: { add: [MODEL_CAPABILITY.WEB_SEARCH] },
        endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
        limits: { maxInputTokens: 64000 },
        modelId: 'gpt-4o',
        providerId: 'openai',
      },
      'openai',
      { [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: 'openai-chat' },
      ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    );

    expect(model).toMatchObject({
      capabilities: [MODEL_CAPABILITY.FUNCTION_CALL, MODEL_CAPABILITY.WEB_SEARCH],
      id: 'openai::gpt-4o',
      maxInputTokens: 64000,
      modelId: 'gpt-4o',
      name: 'GPT-4o',
      presetModelId: 'gpt-4o',
      providerId: 'openai',
      reasoning: {
        supportedEfforts: [REASONING_EFFORT.LOW, REASONING_EFFORT.HIGH],
        type: 'openai-chat',
      },
    });
  });
});
