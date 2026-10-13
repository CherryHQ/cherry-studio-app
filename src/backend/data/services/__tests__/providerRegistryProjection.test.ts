import { type RegistryEndpointConfig } from '@cherrystudio/provider-registry';

import {
  buildRuntimeEndpointConfigs,
  projectLegacyApiFeatures,
} from '../providerRegistryProjection';

describe('projectLegacyApiFeatures', () => {
  it('projects endpoint and provider-owned facts for existing Mobile rows', () => {
    expect(
      projectLegacyApiFeatures({
        defaultChatEndpoint: 'openai-chat-completions',
        endpointConfigs: {
          'openai-chat-completions': {
            dialect: { streamOptions: false },
            requestControls: {
              serviceTier: {
                default: 'standard',
                options: ['standard'],
                wire: {
                  delivery: { key: 'serviceTier', type: 'provider-option' },
                  values: { standard: 'default' },
                },
              },
            },
          },
        },
        id: 'example',
        metadata: { website: {} },
        name: 'Example',
        reportsActualCost: true,
      } as never),
    ).toMatchObject({
      reportsActualCost: true,
      serviceTier: true,
      streamOptions: false,
    });
  });
});

describe('buildRuntimeEndpointConfigs mobile compatibility', () => {
  it('retains the legacy reasoningFormatType projection', () => {
    const result = buildRuntimeEndpointConfigs({
      'openai-chat-completions': {
        adapterFamily: 'deepseek',
        reasoningFormat: { type: 'openai-chat' },
      },
    } as Record<string, RegistryEndpointConfig>);

    expect(result?.['openai-chat-completions']).toEqual({
      adapterFamily: 'deepseek',
      reasoningFormatType: 'openai-chat',
    });
  });
});
