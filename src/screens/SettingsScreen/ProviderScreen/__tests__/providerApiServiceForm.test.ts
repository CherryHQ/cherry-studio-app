import {
  apiKeyEntriesSignature,
  buildApiKeyEntriesFromInput,
  formatApiKeysInput,
  parseApiKeysInput,
} from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceApiKeys';
import { parseCredentialsDraft } from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceAuthDraft';
import {
  getProviderApiServiceApiKeysDirtyState,
  getProviderApiServiceEndpointDirtyState,
} from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceDirtyState';
import {
  buildAddableEndpointOptions,
  canEditProviderEndpoint,
  getConfigurableEndpointTypesForProvider,
  isConfigurableEndpointType,
  mergeEndpointConfigs,
} from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceEndpointRules';
import {
  buildProviderApiServiceApiKeysPayload,
  buildProviderApiServiceEndpointUpdates,
  buildProviderApiServiceSavePayload,
  ProviderApiServiceSaveError,
} from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceSave';

describe('provider API service form helpers', () => {
  it('parses comma and newline separated API keys', () => {
    expect(parseApiKeysInput(' sk-a,sk-b\n\n sk-c , sk-a ')).toEqual(['sk-a', 'sk-b', 'sk-c']);
  });

  it('formats API keys as comma separated values', () => {
    expect(
      formatApiKeysInput([
        { id: 'key-a', key: 'sk-a', isEnabled: false, label: 'Primary' },
        { id: 'key-b', key: 'sk-b', isEnabled: true },
      ]),
    ).toBe('sk-a,sk-b');
  });

  it('preserves existing API key metadata when rebuilding entries', () => {
    const result = buildApiKeyEntriesFromInput('sk-a, sk-new', [
      { id: 'key-a', key: 'sk-a', isEnabled: false, label: 'Primary' },
    ]);

    expect(result[0]).toEqual({
      id: 'key-a',
      key: 'sk-a',
      isEnabled: false,
      label: 'Primary',
    });
    expect(result[1]).toMatchObject({
      key: 'sk-new',
      isEnabled: true,
    });
    expect(result[1]?.id).toEqual(expect.any(String));
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
        'openai-chat-completions',
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

  it('removes empty additional endpoints while preserving primary endpoint metadata', () => {
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
        'openai-chat-completions',
        ['openai-chat-completions', 'openai-responses'],
      ),
    ).toEqual({
      'openai-chat-completions': {
        reasoningFormatType: 'openai-chat',
      },
    });
  });

  it('allows clearing the primary endpoint base URL', () => {
    const updates = buildProviderApiServiceEndpointUpdates({
      draft: {
        apiKeyEntries: [],
        apiKeysInput: '',
        authDraft: {
          accessKeyId: '',
          apiVersion: '',
          clientId: '',
          credentials: '',
          deploymentId: '',
          location: '',
          project: '',
          region: '',
          secretAccessKey: '',
          type: 'api-key',
        },
        baseUrlByEndpoint: {
          'openai-chat-completions': '',
        },
        primaryEndpoint: 'openai-chat-completions',
        visibleEndpointTypes: ['openai-chat-completions'],
      },
      provider: {
        authType: 'api-key',
        endpointConfigs: {
          'openai-chat-completions': { baseUrl: 'https://old.example.com' },
        },
      } as never,
    });

    expect(updates).toEqual({ endpointConfigs: {} });
  });

  it('saves endpoint configs without changing defaultChatEndpoint', () => {
    const payload = buildProviderApiServiceSavePayload({
      apiKeys: [],
      authConfig: { type: 'api-key' },
      draft: {
        apiKeyEntries: [],
        apiKeysInput: '',
        authDraft: {
          accessKeyId: '',
          apiVersion: '',
          clientId: '',
          credentials: '',
          deploymentId: '',
          location: '',
          project: '',
          region: '',
          secretAccessKey: '',
          type: 'api-key',
        },
        baseUrlByEndpoint: {
          'openai-chat-completions': 'https://chat.example.com',
          'openai-responses': 'https://responses.example.com',
        },
        primaryEndpoint: 'openai-chat-completions',
        visibleEndpointTypes: ['openai-chat-completions', 'openai-responses'],
      },
      provider: {
        authType: 'api-key',
        defaultChatEndpoint: 'openai-chat-completions',
        endpointConfigs: {
          'openai-chat-completions': { baseUrl: 'https://old.example.com' },
        },
      } as never,
    });

    expect(payload.providerUpdates).toEqual({
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
        'openai-responses': { baseUrl: 'https://responses.example.com' },
      },
    });
  });

  it('builds endpoint-only updates for the endpoint settings screen', () => {
    const updates = buildProviderApiServiceEndpointUpdates({
      draft: {
        apiKeyEntries: [{ id: 'key-a', isEnabled: true, key: 'sk-a' }],
        apiKeysInput: 'sk-a',
        authDraft: {
          accessKeyId: '',
          apiVersion: '',
          clientId: '',
          credentials: '',
          deploymentId: '',
          location: '',
          project: '',
          region: '',
          secretAccessKey: '',
          type: 'api-key',
        },
        baseUrlByEndpoint: {
          'openai-chat-completions': 'https://chat.example.com',
          'openai-responses': '',
        },
        primaryEndpoint: 'openai-chat-completions',
        visibleEndpointTypes: ['openai-chat-completions', 'openai-responses'],
      },
      provider: {
        authType: 'api-key',
        endpointConfigs: {
          'openai-chat-completions': { baseUrl: 'https://old.example.com' },
          'openai-responses': { baseUrl: 'https://responses.example.com' },
        },
      } as never,
    });

    expect(updates).toEqual({
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
      },
    });
  });

  it('saves API key entries with enabled state', () => {
    const payload = buildProviderApiServiceSavePayload({
      apiKeys: [{ id: 'key-a', isEnabled: true, key: 'sk-a' }],
      authConfig: { type: 'api-key' },
      draft: {
        apiKeyEntries: [
          { id: 'key-a', isEnabled: false, key: 'sk-a' },
          { id: 'key-b', isEnabled: true, key: 'sk-b' },
        ],
        apiKeysInput: 'sk-a,sk-b',
        authDraft: {
          accessKeyId: '',
          apiVersion: '',
          clientId: '',
          credentials: '',
          deploymentId: '',
          location: '',
          project: '',
          region: '',
          secretAccessKey: '',
          type: 'api-key',
        },
        baseUrlByEndpoint: {
          'openai-chat-completions': 'https://chat.example.com',
        },
        primaryEndpoint: 'openai-chat-completions',
        visibleEndpointTypes: ['openai-chat-completions'],
      },
      provider: {
        authType: 'api-key',
        defaultChatEndpoint: 'openai-chat-completions',
        endpointConfigs: {
          'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
        },
      } as never,
    });

    expect(payload.apiKeys).toEqual([
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

  it('builds API key-only payload for the API key settings screen', () => {
    expect(
      buildProviderApiServiceApiKeysPayload({
        apiKeyEntries: [
          { id: 'key-a', isEnabled: false, key: ' sk-a ' },
          { id: 'key-empty', isEnabled: true, key: ' ' },
          { id: 'key-b', isEnabled: true, key: 'sk-b' },
        ],
        apiKeysInput: 'sk-a,sk-b',
        authDraft: {
          accessKeyId: '',
          apiVersion: '',
          clientId: '',
          credentials: '',
          deploymentId: '',
          location: '',
          project: '',
          region: '',
          secretAccessKey: '',
          type: 'api-key',
        },
        baseUrlByEndpoint: {
          'openai-chat-completions': 'https://chat.example.com',
        },
        primaryEndpoint: 'openai-chat-completions',
        visibleEndpointTypes: ['openai-chat-completions'],
      }),
    ).toEqual([
      { id: 'key-a', isEnabled: false, key: 'sk-a' },
      { id: 'key-b', isEnabled: true, key: 'sk-b' },
    ]);
  });

  it('ignores empty new API key rows in dirty state', () => {
    expect(
      getProviderApiServiceApiKeysDirtyState({
        apiKeys: [{ id: 'key-a', isEnabled: true, key: 'sk-a' }],
        draft: {
          apiKeyEntries: [
            { id: 'key-a', isEnabled: true, key: 'sk-a' },
            { id: 'key-empty', isEnabled: true, key: '' },
          ],
          apiKeysInput: 'sk-a',
          authDraft: {
            accessKeyId: '',
            apiVersion: '',
            clientId: '',
            credentials: '',
            deploymentId: '',
            location: '',
            project: '',
            region: '',
            secretAccessKey: '',
            type: 'api-key',
          },
          baseUrlByEndpoint: {
            'openai-chat-completions': 'https://chat.example.com',
          },
          primaryEndpoint: 'openai-chat-completions',
          visibleEndpointTypes: ['openai-chat-completions'],
        },
      }),
    ).toBe(false);
  });

  it('ignores empty new endpoint rows in dirty state', () => {
    expect(
      getProviderApiServiceEndpointDirtyState({
        draft: {
          apiKeyEntries: [],
          apiKeysInput: '',
          authDraft: {
            accessKeyId: '',
            apiVersion: '',
            clientId: '',
            credentials: '',
            deploymentId: '',
            location: '',
            project: '',
            region: '',
            secretAccessKey: '',
            type: 'api-key',
          },
          baseUrlByEndpoint: {
            'openai-chat-completions': 'https://chat.example.com',
            'openai-responses': '',
          },
          primaryEndpoint: 'openai-chat-completions',
          visibleEndpointTypes: ['openai-chat-completions', 'openai-responses'],
        },
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
      buildProviderApiServiceSavePayload({
        apiKeys: [],
        authConfig: { type: 'api-key' },
        draft: {
          apiKeyEntries: [],
          apiKeysInput: '',
          authDraft: {
            accessKeyId: '',
            apiVersion: '',
            clientId: '',
            credentials: '',
            deploymentId: '',
            location: '',
            project: '',
            region: '',
            secretAccessKey: '',
            type: 'api-key',
          },
          baseUrlByEndpoint: {
            'openai-chat-completions': 'not a url',
          },
          primaryEndpoint: 'openai-chat-completions',
          visibleEndpointTypes: ['openai-chat-completions'],
        },
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
    ]);
    expect(
      buildAddableEndpointOptions({ authType: 'api-key' } as never, [
        'openai-chat-completions',
        'openai-responses',
      ]),
    ).toEqual(['anthropic-messages', 'google-generate-content']);
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

  it('requires GCP credentials to be a JSON object when provided', () => {
    expect(parseCredentialsDraft('{"client_email":"test@example.com"}')).toEqual({
      client_email: 'test@example.com',
    });
    expect(() => parseCredentialsDraft('[]')).toThrow('credentials must be a JSON object');
  });
});
