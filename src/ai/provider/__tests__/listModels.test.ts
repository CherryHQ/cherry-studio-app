import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Provider } from '@/data/types/provider';

import { listModels } from '../listModels';

describe('listModels', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('keeps CherryIN owned_by separate from desktop default group', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'anthropic/claude-sonnet-4-5',
              object: 'model',
              owned_by: 'custom',
            },
          ],
          object: 'list',
        }),
        { status: 200 },
      ),
    );

    const models = await listModels(createProvider(), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    expect(models).toEqual([
      expect.objectContaining({
        apiModelId: 'anthropic/claude-sonnet-4-5',
        group: 'anthropic',
        id: 'cherryin::anthropic/claude-sonnet-4-5',
        modelId: 'anthropic/claude-sonnet-4-5',
        ownedBy: 'custom',
        providerId: 'cherryin',
      }),
    ]);
  });

  test('keeps Together organization separate from desktop default group', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
            display_name: 'Llama 3.1 8B',
            organization: 'Meta',
          },
        ]),
        { status: 200 },
      ),
    );

    const models = await listModels(createProvider({ id: 'together' }), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    expect(models).toEqual([
      expect.objectContaining({
        apiModelId: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
        group: 'meta-llama',
        modelId: 'meta-llama/Llama-3.1-8B-Instruct-Turbo',
        ownedBy: 'Meta',
        providerId: 'together',
      }),
    ]);
  });

  test('keeps AI Gateway provider owner separate from desktop default group', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            {
              id: 'openai/gpt-4o',
              name: 'GPT-4o',
              specification: { provider: 'OpenAI' },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const models = await listModels(createProvider({ id: 'gateway' }), {
      getRotatedApiKey: jest.fn(async () => 'test-key'),
    });

    expect(models).toEqual([
      expect.objectContaining({
        apiModelId: 'openai/gpt-4o',
        group: 'openai',
        modelId: 'openai/gpt-4o',
        ownedBy: 'OpenAI',
        providerId: 'gateway',
      }),
    ]);
  });
});

function createProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      developerRole: true,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
    },
    apiKeys: [],
    authType: 'api-key',
    defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
    endpointConfigs: {
      [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
        baseUrl: 'https://api.cherry-ai.com',
      },
    },
    id: 'cherryin',
    isEnabled: true,
    name: 'CherryIN',
    settings: {},
    ...overrides,
  };
}
