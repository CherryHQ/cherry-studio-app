import { DEFAULT_API_FEATURES, type Provider } from '@/shared/data/types/provider';

import { resolveProviderLanguageTransportPolicy } from '../providerTransport';

jest.mock('@/backend/ai/provider/cherryai', () => ({
  generateSignature: jest.fn(() => ({
    'X-Client-ID': 'cherry-studio',
    'X-Signature': 'signed',
    'X-Timestamp': '1700000000',
  })),
}));

const { generateSignature } = jest.requireMock('@/backend/ai/provider/cherryai') as {
  generateSignature: jest.Mock;
};

describe('resolveProviderLanguageTransportPolicy', () => {
  beforeEach(() => {
    generateSignature.mockClear();
  });

  it('shares CherryAI request signing with every language binding', async () => {
    const baseFetch = jest.fn(async () => new Response(null, { status: 204 }));
    const policy = resolveProviderLanguageTransportPolicy(
      createProvider('custom-cherryai', 'cherryai'),
    );
    const fetch = policy?.wrapFetch(baseFetch as unknown as typeof globalThis.fetch);

    await fetch?.('https://api.cherry-ai.com/chat/completions', {
      body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }] }),
      headers: { Existing: 'header' },
      method: 'POST',
    });

    expect(generateSignature).toHaveBeenCalledWith({
      body: { messages: [{ content: 'hi', role: 'user' }] },
      method: 'POST',
      path: '/chat/completions',
      query: '',
    });
    expect(baseFetch).toHaveBeenCalledWith('https://api.cherry-ai.com/chat/completions', {
      body: JSON.stringify({ messages: [{ content: 'hi', role: 'user' }] }),
      headers: {
        Existing: 'header',
        'X-Client-ID': 'cherry-studio',
        'X-Signature': 'signed',
        'X-Timestamp': '1700000000',
      },
      method: 'POST',
    });
  });

  it('does not add a transport policy to ordinary compatible Providers', () => {
    expect(resolveProviderLanguageTransportPolicy(createProvider('custom-openai'))).toBeUndefined();
  });
});

function createProvider(id: string, presetProviderId?: string): Provider {
  return {
    apiFeatures: { ...DEFAULT_API_FEATURES },
    apiKeys: [],
    authType: 'api-key',
    endpointConfigs: {},
    id,
    isEnabled: true,
    name: id,
    presetProviderId,
    settings: {},
  };
}
