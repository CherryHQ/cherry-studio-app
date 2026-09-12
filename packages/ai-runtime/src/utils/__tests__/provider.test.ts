import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { getExtraHeaders } from '../provider';

describe('getExtraHeaders', () => {
  test('adds the Cherry source to the Radeon Cloud preset', () => {
    const provider = createProvider({
      id: 'radeon-cloud',
      settings: { extraHeaders: { 'X-Custom': 'keep' } },
    });

    expect(getExtraHeaders(provider)).toEqual({
      'X-Custom': 'keep',
      'X-Source': 'cherry-studio',
    });
  });

  test('adds the Cherry source to providers copied from the Radeon Cloud preset', () => {
    const provider = createProvider({
      id: 'custom-radeon',
      presetProviderId: 'radeon-cloud',
    });

    expect(getExtraHeaders(provider)).toEqual({ 'X-Source': 'cherry-studio' });
  });

  test('replaces case-insensitive user X-Source overrides with the stable source', () => {
    const provider = createProvider({
      id: 'radeon-cloud',
      settings: { extraHeaders: { 'x-source': 'other-client', 'X-Custom': 'keep' } },
    });

    expect(getExtraHeaders(provider)).toEqual({
      'X-Custom': 'keep',
      'X-Source': 'cherry-studio',
    });
  });

  test('does not add the Radeon source to other providers', () => {
    const provider = createProvider({
      id: 'openai',
      settings: { extraHeaders: { 'X-Custom': 'keep' } },
    });

    expect(getExtraHeaders(provider)).toEqual({ 'X-Custom': 'keep' });
  });
});

function createProvider(overrides: Partial<Provider>): Provider {
  return {
    apiFeatures: {
      arrayContent: true,
      reportsActualCost: false,
      serviceTier: true,
      streamOptions: true,
      verbosity: false,
    },
    apiKeys: [],
    authType: 'api-key',
    endpointConfigs: {},
    id: 'provider',
    isEnabled: true,
    name: 'Provider',
    settings: {},
    ...overrides,
  };
}
