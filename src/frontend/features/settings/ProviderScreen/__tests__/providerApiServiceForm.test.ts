import {
  apiKeyEntriesSignature,
  buildApiKeysInputFromEntries,
  normalizeApiKeyEntries,
  normalizeApiKeySingleLine,
} from '../apiService/utils/providerApiServiceApiKeys';
import { shouldShowApiKeys } from '../apiService/utils/providerApiServiceAuth';
import {
  getProviderApiServiceApiKeysDirtyState,
  getProviderApiServiceEndpointDirtyState,
} from '../apiService/utils/providerApiServiceDirtyState';
import type { EndpointDraft } from '../apiService/utils/providerApiServiceEndpointDraft';
import {
  buildCustomProviderCreationPayload,
  canEditProviderEndpoint,
  findInvalidCustomProviderEndpointUrl,
  getConfigurableEndpointTypesForProvider,
  getProviderPrimaryBaseUrl,
  isConfigurableEndpointType,
  mergeEndpointConfigs,
} from '../apiService/utils/providerApiServiceEndpointRules';
import {
  buildProviderApiServiceEndpointUpdates,
  buildProviderPrimaryBaseUrlUpdates,
  ProviderApiServiceSaveError,
} from '../apiService/utils/providerApiServiceSave';

function createTestEndpointDraft(overrides: Partial<EndpointDraft> = {}): EndpointDraft {
  return {
    baseUrlByEndpoint: overrides.baseUrlByEndpoint ?? {
      'openai-chat-completions': 'https://chat.example.com',
    },
    primaryEndpoint: overrides.primaryEndpoint ?? 'openai-chat-completions',
    visibleEndpointTypes: overrides.visibleEndpointTypes ?? ['openai-chat-completions'],
  };
}

describe('provider API service form helpers', () => {
  it('hides manual keys only for login-only providers', () => {
    expect(shouldShowApiKeys('api-key', { authMethods: ['oauth'] })).toBe(false);
    expect(shouldShowApiKeys('api-key', { authMethods: ['api-key', 'oauth'] })).toBe(true);
    expect(shouldShowApiKeys('oauth', { authMethods: ['api-key', 'oauth'] })).toBe(true);
  });

  it('removes line breaks from a single API key', () => {
    expect(normalizeApiKeySingleLine('sk-a\r\nsk-b\nsk-c')).toBe('sk-ask-bsk-c');
  });

  it('formats API keys as comma separated values', () => {
    expect(
      buildApiKeysInputFromEntries([
        { id: 'key-a', key: 'sk-a', isEnabled: false, label: 'Primary' },
        { id: 'key-b', key: 'sk-b', isEnabled: true },
      ]),
    ).toBe('sk-a,sk-b');
  });

  it('merges endpoint base URLs without dropping endpoint metadata', () => {
    expect(
      mergeEndpointConfigs(
        {
          'openai-chat-completions': {
            baseUrl: 'https://old.example.com',
            reasoningFormatType: 'openai-chat',
          },
          'openai-responses': {
            baseUrl: 'https://responses.example.com',
          },
        },
        {
          'openai-chat-completions': ' https://new.example.com ',
          'openai-responses': 'https://responses.example.com',
        },
        ['openai-chat-completions', 'openai-responses'],
      ),
    ).toEqual({
      'openai-chat-completions': {
        baseUrl: 'https://new.example.com',
        reasoningFormatType: 'openai-chat',
      },
      'openai-responses': {
        baseUrl: 'https://responses.example.com',
      },
    });
  });

  it('removes empty base URLs without dropping endpoint metadata', () => {
    expect(
      mergeEndpointConfigs(
        {
          'openai-chat-completions': {
            baseUrl: 'https://chat.example.com',
            reasoningFormatType: 'openai-chat',
          },
          'openai-responses': {
            baseUrl: 'https://old-responses.example.com',
            reasoningFormatType: 'openai-responses',
          },
        },
        {
          'openai-chat-completions': '',
          'openai-responses': '',
        },
        ['openai-chat-completions', 'openai-responses'],
      ),
    ).toEqual({
      'openai-chat-completions': {
        reasoningFormatType: 'openai-chat',
      },
      'openai-responses': {
        reasoningFormatType: 'openai-responses',
      },
    });
  });

  it('builds independent text, image generation, and image editing configs', () => {
    expect(
      buildCustomProviderCreationPayload({
        endpointUrls: {
          'anthropic-messages': ' https://chat.example.com ',
          'openai-image-generation': ' https://generate.example.com ',
          'openai-image-edit': ' https://edit.example.com ',
        },
      }),
    ).toEqual({
      defaultChatEndpoint: 'anthropic-messages',
      endpointConfigs: {
        'anthropic-messages': { baseUrl: 'https://chat.example.com' },
        'openai-image-generation': { baseUrl: 'https://generate.example.com' },
        'openai-image-edit': { baseUrl: 'https://edit.example.com' },
      },
    });
  });

  it('validates every configured custom provider endpoint URL', () => {
    expect(
      findInvalidCustomProviderEndpointUrl({
        'openai-chat-completions': 'https://chat.example.com',
        'openai-image-edit': 'ftp://edit.example.com',
      }),
    ).toBe('openai-image-edit');
    expect(
      findInvalidCustomProviderEndpointUrl({
        'openai-chat-completions': 'https://chat.example.com',
        'openai-image-edit': '',
      }),
    ).toBeNull();
  });

  it('reads the primary endpoint base URL straight off the provider', () => {
    expect(
      getProviderPrimaryBaseUrl({
        defaultChatEndpoint: 'anthropic-messages',
        endpointConfigs: {
          'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
          'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
        },
      } as never),
    ).toBe('https://anthropic.example.com');
    expect(getProviderPrimaryBaseUrl(undefined)).toBe('');
    expect(getProviderPrimaryBaseUrl({ endpointConfigs: {} } as never)).toBe('');
  });

  it('removes a cleared default endpoint base URL without changing the endpoint type', () => {
    expect(
      buildProviderApiServiceEndpointUpdates({
        draft: createTestEndpointDraft({
          baseUrlByEndpoint: {
            'openai-chat-completions': '',
          },
        }),
        provider: {
          authType: 'api-key',
          endpointConfigs: {
            'openai-chat-completions': { baseUrl: 'https://old.example.com' },
          },
        } as never,
      }),
    ).toEqual({
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {},
    });
  });

  it('saves endpoint configs with the selected defaultChatEndpoint', () => {
    const updates = buildProviderApiServiceEndpointUpdates({
      draft: createTestEndpointDraft({
        baseUrlByEndpoint: {
          'openai-chat-completions': 'https://chat.example.com',
          'openai-responses': 'https://responses.example.com',
        },
        visibleEndpointTypes: ['openai-chat-completions', 'openai-responses'],
      }),
      provider: {
        authType: 'api-key',
        defaultChatEndpoint: 'openai-chat-completions',
        endpointConfigs: {
          'openai-chat-completions': { baseUrl: 'https://old.example.com' },
        },
      } as never,
    });

    expect(updates).toEqual({
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
        'openai-responses': { baseUrl: 'https://responses.example.com' },
      },
    });
  });

  it('builds endpoint-only updates for the endpoint settings screen', () => {
    const updates = buildProviderApiServiceEndpointUpdates({
      draft: createTestEndpointDraft({
        baseUrlByEndpoint: {
          'openai-chat-completions': 'https://chat.example.com',
          'openai-responses': '',
        },
        visibleEndpointTypes: ['openai-chat-completions', 'openai-responses'],
      }),
      provider: {
        authType: 'api-key',
        endpointConfigs: {
          'openai-chat-completions': { baseUrl: 'https://old.example.com' },
          'openai-responses': { baseUrl: 'https://responses.example.com' },
        },
      } as never,
    });

    expect(updates).toEqual({
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
      },
    });
  });

  it('persists a configured endpoint as the provider default', () => {
    const updates = buildProviderApiServiceEndpointUpdates({
      draft: createTestEndpointDraft({
        baseUrlByEndpoint: {
          'anthropic-messages': 'https://anthropic.example.com',
          'openai-chat-completions': 'https://chat.example.com',
        },
        primaryEndpoint: 'anthropic-messages',
        visibleEndpointTypes: ['openai-chat-completions', 'anthropic-messages'],
      }),
      provider: {
        authType: 'api-key',
        defaultChatEndpoint: 'openai-chat-completions',
        endpointConfigs: {
          'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
          'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
        },
      } as never,
    });

    expect(updates.defaultChatEndpoint).toBe('anthropic-messages');
  });

  it('updates only the primary Base URL and preserves endpoint metadata', () => {
    expect(
      buildProviderPrimaryBaseUrlUpdates({
        baseUrl: ' https://next.example.com ',
        provider: {
          defaultChatEndpoint: 'openai-chat-completions',
          endpointConfigs: {
            'anthropic-messages': {
              baseUrl: 'https://anthropic.example.com',
              reasoningFormatType: 'anthropic',
            },
            'openai-chat-completions': {
              baseUrl: 'https://chat.example.com',
              reasoningFormatType: 'openai-chat',
            },
          },
        } as never,
      }),
    ).toEqual({
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'anthropic-messages': {
          baseUrl: 'https://anthropic.example.com',
          reasoningFormatType: 'anthropic',
        },
        'openai-chat-completions': {
          baseUrl: 'https://next.example.com',
          reasoningFormatType: 'openai-chat',
        },
      },
    });
  });

  it('normalizes API key entries before they reach the save call', () => {
    expect(
      normalizeApiKeyEntries([
        { id: 'key-a', isEnabled: false, key: ' sk-a ' },
        { id: 'key-empty', isEnabled: true, key: ' ' },
        { id: 'key-b', isEnabled: true, key: 'sk-b' },
        { id: 'key-duplicate', isEnabled: true, key: 'sk-a' },
      ]),
    ).toEqual([
      { id: 'key-a', isEnabled: false, key: 'sk-a' },
      { id: 'key-b', isEnabled: true, key: 'sk-b' },
    ]);
  });

  it('compares API key entries independent of ordering', () => {
    expect(
      apiKeyEntriesSignature([
        { id: 'key-b', isEnabled: true, key: 'sk-b' },
        { id: 'key-a', isEnabled: false, key: 'sk-a' },
      ]),
    ).toBe(
      apiKeyEntriesSignature([
        { id: 'key-a', isEnabled: false, key: 'sk-a' },
        { id: 'key-b', isEnabled: true, key: 'sk-b' },
      ]),
    );
  });

  it('ignores empty new API key rows in dirty state', () => {
    expect(
      getProviderApiServiceApiKeysDirtyState({
        apiKeys: [{ id: 'key-a', isEnabled: true, key: 'sk-a' }],
        entries: [
          { id: 'key-a', isEnabled: true, key: 'sk-a' },
          { id: 'key-empty', isEnabled: true, key: '' },
        ],
      }),
    ).toBe(false);
  });

  it('reports API key edits as dirty', () => {
    expect(
      getProviderApiServiceApiKeysDirtyState({
        apiKeys: [{ id: 'key-a', isEnabled: true, key: 'sk-a' }],
        entries: [{ id: 'key-a', isEnabled: true, key: 'sk-edited' }],
      }),
    ).toBe(true);
  });

  it('ignores empty new endpoint rows in dirty state', () => {
    expect(
      getProviderApiServiceEndpointDirtyState({
        draft: createTestEndpointDraft({
          baseUrlByEndpoint: {
            'openai-chat-completions': 'https://chat.example.com',
            'openai-responses': '',
          },
          visibleEndpointTypes: ['openai-chat-completions', 'openai-responses'],
        }),
        provider: {
          authType: 'api-key',
          endpointConfigs: {
            'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
          },
        } as never,
      }),
    ).toBe(false);
  });

  it('rejects invalid endpoint base URLs', () => {
    expect(() =>
      buildProviderApiServiceEndpointUpdates({
        draft: createTestEndpointDraft({
          baseUrlByEndpoint: {
            'openai-chat-completions': 'not a url',
          },
        }),
        provider: { authType: 'api-key' } as never,
      }),
    ).toThrow(new ProviderApiServiceSaveError('invalid-base-url'));
  });

  it('rejects an invalid base URL on a secondary endpoint', () => {
    expect(() =>
      buildProviderApiServiceEndpointUpdates({
        draft: createTestEndpointDraft({
          baseUrlByEndpoint: {
            'openai-chat-completions': 'https://chat.example.com',
            'openai-responses': 'ftp://responses.example.com',
          },
          visibleEndpointTypes: ['openai-chat-completions', 'openai-responses'],
        }),
        provider: { authType: 'api-key' } as never,
      }),
    ).toThrow(new ProviderApiServiceSaveError('invalid-base-url'));
  });

  it('keeps configurable endpoint choices aligned with the desktop endpoint set', () => {
    expect(isConfigurableEndpointType('openai-embeddings' as never)).toBe(false);
    expect(isConfigurableEndpointType('openai-chat-completions')).toBe(true);
    expect(getConfigurableEndpointTypesForProvider({ authType: 'api-key' } as never)).toEqual([
      'openai-chat-completions',
      'openai-responses',
      'anthropic-messages',
      'google-generate-content',
      'openai-image-generation',
      'openai-image-edit',
    ]);
    expect(getConfigurableEndpointTypesForProvider({ authType: 'iam-gcp' } as never)).toEqual([]);
  });

  it('only allows endpoint editing for URL-based provider auth types', () => {
    expect(canEditProviderEndpoint({ authType: 'api-key' } as never)).toBe(true);
    expect(canEditProviderEndpoint({ authType: 'iam-azure' } as never)).toBe(true);
    expect(canEditProviderEndpoint({ authType: 'api-key-aws' } as never)).toBe(false);
    expect(canEditProviderEndpoint({ authType: 'iam-aws' } as never)).toBe(false);
    expect(canEditProviderEndpoint({ authType: 'iam-gcp' } as never)).toBe(false);
    expect(canEditProviderEndpoint({ authType: 'oauth' } as never)).toBe(false);
  });
});
