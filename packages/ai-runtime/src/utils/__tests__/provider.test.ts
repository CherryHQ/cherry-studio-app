import type { Provider } from '@cherrystudio/universal/data/types/provider';

import {
  formatApiHost,
  getExtraHeaders,
  getProviderBaseUrlIssue,
  routeToEndpoint,
} from '../provider';

describe('provider base URLs', () => {
  test.each([
    ['https://proxy.example.com/gateway#', 'https://proxy.example.com/gateway'],
    ['https://proxy.example.com/gateway/#', 'https://proxy.example.com/gateway'],
    ['https://proxy.example.com/my-responses#', 'https://proxy.example.com/my-responses'],
    ['https://proxy.example.com/v1', 'https://proxy.example.com/v1'],
    ['https://proxy.example.com', 'https://proxy.example.com/v1'],
  ])('formats %s without sending a version marker to the server', (input, expected) => {
    expect(formatApiHost(input)).toBe(expected);
  });

  test('retains full endpoint overrides for the existing AI SDK routing contract', () => {
    expect(
      routeToEndpoint(formatApiHost('https://proxy.example.com/custom/chat/completions#')),
    ).toEqual({
      baseURL: 'https://proxy.example.com/custom',
      endpoint: 'chat/completions',
    });
  });

  test.each([
    ['https://proxy.example.com/v1/chat/completions', 'https://proxy.example.com/v1'],
    ['https://proxy.example.com/gateway/responses', 'https://proxy.example.com/gateway#'],
    ['https://proxy.example.com/gateway/chat/completions#', 'https://proxy.example.com/gateway#'],
  ])(
    'offers a base URL that preserves the pasted request path for %s',
    (input, suggestedBaseUrl) => {
      expect(getProviderBaseUrlIssue(input)).toEqual({ code: 'endpoint-path', suggestedBaseUrl });
    },
  );

  test.each([
    'https://proxy.example.com?api-version=v1',
    'https://proxy.example.com#fragment',
    'https://name:secret@proxy.example.com',
    'file:///private',
  ])('rejects URL components that would absorb or hide the request path: %s', (input) => {
    expect(getProviderBaseUrlIssue(input)).toEqual({ code: 'invalid-url' });
  });

  test('accepts the desktop no-version base URL syntax', () => {
    expect(getProviderBaseUrlIssue('https://proxy.example.com/gateway#')).toBeNull();
  });
});

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
