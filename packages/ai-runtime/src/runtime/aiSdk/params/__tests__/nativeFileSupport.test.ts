import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';
import type { Model, UniqueModelId } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';

import type { AppProviderId } from '../../../../types';
import { resolveNativeFileSupport } from '../nativeFileSupport';

describe('resolveNativeFileSupport', () => {
  test.each([
    ['OpenAI Responses', provider('openai'), model('openai', 'gpt-4o'), 'openai'],
    ['Anthropic', provider('anthropic'), model('anthropic', 'claude-3-7-sonnet'), 'anthropic'],
    ['Google', provider('gemini'), model('gemini', 'gemini-2.5-pro'), 'google'],
    ['Azure', provider('azure-openai'), model('azure-openai', 'gpt-4o'), 'azure'],
    [
      'Azure Responses',
      provider('azure-openai'),
      model('azure-openai', 'gpt-4o'),
      'azure-responses',
    ],
    [
      'Azure Anthropic',
      provider('azure-openai'),
      model('azure-openai', 'claude-sonnet-4'),
      'azure-anthropic',
    ],
    ['Vertex Gemini', provider('vertexai'), model('vertexai', 'gemini-2.5-pro'), 'google-vertex'],
    [
      'Vertex Anthropic',
      provider('vertexai'),
      model('vertexai', 'claude-sonnet-4'),
      'google-vertex-anthropic',
    ],
    ['Bedrock Anthropic', provider('aws-bedrock'), model('aws-bedrock', 'claude-3-7'), 'bedrock'],
  ] as const)('allows native PDF for %s', (_name, targetProvider, targetModel, adapterId) => {
    expect(
      resolveNativeFileSupport(targetProvider, targetModel, adapterId as AppProviderId).pdf,
    ).toBe(true);
  });

  test.each([
    ['OpenAI Chat', provider('openai'), model('openai', 'gpt-4o'), 'openai-chat'],
    ['compatible aggregator', provider('somehub'), model('somehub', 'gpt-4o'), 'openai-compatible'],
    ['wrong Google model family', provider('gemini'), model('gemini', 'gpt-4o'), 'google'],
    [
      'wrong Bedrock model family',
      provider('aws-bedrock'),
      model('aws-bedrock', 'nova-pro'),
      'bedrock',
    ],
  ] as const)('rejects native PDF for %s', (_name, targetProvider, targetModel, adapterId) => {
    expect(
      resolveNativeFileSupport(targetProvider, targetModel, adapterId as AppProviderId).pdf,
    ).toBe(false);
  });

  test('keeps image, audio, and video native on compatible models through aggregators', () => {
    const support = resolveNativeFileSupport(
      provider('somehub'),
      model('somehub', 'multimodal', [
        MODEL_CAPABILITY.IMAGE_RECOGNITION,
        MODEL_CAPABILITY.AUDIO_RECOGNITION,
        MODEL_CAPABILITY.VIDEO_RECOGNITION,
      ]),
      'openai-compatible',
    );

    expect(support).toEqual({ image: true, pdf: false, audio: true, video: true });
  });

  test.each([provider('qiniu'), provider('custom-qiniu', 'qiniu')])(
    'forces every native attachment type to text for Qiniu',
    (targetProvider) => {
      expect(
        resolveNativeFileSupport(
          targetProvider,
          model(targetProvider.id, 'gpt-4o', [
            MODEL_CAPABILITY.IMAGE_RECOGNITION,
            MODEL_CAPABILITY.AUDIO_RECOGNITION,
            MODEL_CAPABILITY.VIDEO_RECOGNITION,
          ]),
          'openai',
        ),
      ).toEqual({ image: false, pdf: false, audio: false, video: false });
    },
  );
});

function provider(id: string, presetProviderId?: string): Provider {
  return { id, presetProviderId } as Provider;
}

function model(
  providerId: string,
  modelId: string,
  capabilities: Model['capabilities'] = [],
): Model {
  return {
    capabilities,
    id: `${providerId}::${modelId}` as UniqueModelId,
    isDeprecated: false,
    isEnabled: true,
    isHidden: false,
    modelId,
    name: modelId,
    providerId,
    supportsStreaming: true,
  };
}
