import type { PreferenceSchema, PreferenceKeyType } from '@/shared/data/preference';

import {
  getProviderForCapability,
  getRuntimeConfig,
  mergeWebSearchProviderPreset,
} from '../config';

type PreferenceMap = Partial<PreferenceSchema>;

describe('web search config', () => {
  test('merges provider presets with trimmed overrides', () => {
    expect(
      mergeWebSearchProviderPreset(
        {
          id: 'tavily',
          name: 'Tavily',
          type: 'api',
          capabilities: [{ feature: 'searchKeywords', apiHost: 'https://api.tavily.com' }],
        },
        {
          apiKeys: [' key-a ', '', 'key-b'],
          capabilities: {
            searchKeywords: { apiHost: ' https://example.com/ ' },
          },
          engines: [' google ', ''],
          basicAuthUsername: ' user ',
          basicAuthPassword: ' pass ',
        },
      ),
    ).toEqual({
      id: 'tavily',
      name: 'Tavily',
      type: 'api',
      apiKeys: ['key-a', 'key-b'],
      capabilities: [{ feature: 'searchKeywords', apiHost: 'https://example.com/' }],
      engines: ['google'],
      basicAuthUsername: 'user',
      basicAuthPassword: 'pass',
    });
  });

  test('resolves defaults and runtime config from preferences', async () => {
    const preferences = createPreferenceReader({
      'chat.web_search.default_search_keywords_provider': 'tavily',
      'chat.web_search.max_results': 0,
      'chat.web_search.compression.method': 'cutoff',
      'chat.web_search.compression.cutoff_limit': -1,
      'chat.web_search.provider_overrides': {
        tavily: {
          apiKeys: ['key'],
        },
      },
    });

    await expect(
      getProviderForCapability(undefined, 'searchKeywords', preferences),
    ).resolves.toMatchObject({
      id: 'tavily',
      apiKeys: ['key'],
    });
    await expect(getRuntimeConfig(preferences)).resolves.toEqual({
      maxResults: 1,
      compression: {
        method: 'cutoff',
        cutoffLimit: 2000,
      },
    });
  });

  test('throws when default provider is missing or capability is unsupported', async () => {
    await expect(
      getProviderForCapability(undefined, 'searchKeywords', createPreferenceReader()),
    ).rejects.toThrow('Default web search provider is not configured');

    await expect(
      getProviderForCapability(
        'fetch',
        'searchKeywords',
        createPreferenceReader({
          'chat.web_search.provider_overrides': {},
        }),
      ),
    ).rejects.toThrow('does not support capability');
  });
});

function createPreferenceReader(values: PreferenceMap = {}) {
  // The two default-provider keys are deliberately absent: tests that exercise
  // the unconfigured path rely on `get` resolving them to undefined.
  const defaults: PreferenceMap = {
    'chat.web_search.max_results': 5,
    'chat.web_search.compression.method': 'none',
    'chat.web_search.compression.cutoff_limit': 2000,
    'chat.web_search.provider_overrides': {},
  };

  return {
    get: <K extends PreferenceKeyType>(key: K) =>
      (values[key] ?? defaults[key]) as PreferenceSchema[K],
  };
}
