import type { Provider } from '@/data/types/provider';
import {
  apiKeyEntriesSignature,
  buildApiKeyEntriesFromInput,
  buildApiKeysInputFromEntries,
  formatApiKeysInput,
  normalizeApiKeyEntries,
  parseApiKeysInput,
} from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceApiKeys';
import { parseCredentialsDraft } from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceAuthDraft';
import {
  getProviderApiServiceApiKeysDirtyState,
  getProviderApiServiceEndpointDirtyState,
} from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceDirtyState';
import {
  createDraftSnapshot,
  type DraftSnapshot,
} from '@/screens/SettingsScreen/ProviderScreen/apiService/utils/providerApiServiceDraft';
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

const DEFAULT_AUTH_DRAFT: DraftSnapshot['authDraft'] = {
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
};

function createTestDraftSnapshot(overrides: Partial<DraftSnapshot> = {}): DraftSnapshot {
  const {
    apiKeyEntries = [],
    apiKeysBaselineSignature,
    apiKeysInput,
    authDraft,
    baseUrlByEndpoint,
    primaryEndpoint,
    visibleEndpointTypes,
    ...rest
  } = overrides;

  return {
    ...rest,
    apiKeyEntries,
    apiKeysBaselineSignature:
      apiKeysBaselineSignature ?? apiKeyEntriesSignature(normalizeApiKeyEntries(apiKeyEntries)),
    apiKeysInput: apiKeysInput ?? buildApiKeysInputFromEntries(apiKeyEntries),
    authDraft: authDraft ?? { ...DEFAULT_AUTH_DRAFT },
    baseUrlByEndpoint: baseUrlByEndpoint ?? {
      'openai-chat-completions': 'https://chat.example.com',
    },
    primaryEndpoint: primaryEndpoint ?? 'openai-chat-completions',
    visibleEndpointTypes: visibleEndpointTypes ?? ['openai-chat-completions'],
  };
}

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
      draft: createTestDraftSnapshot({
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
    });

    expect(updates).toEqual({ endpointConfigs: {} });
  });

  it('saves endpoint configs without changing defaultChatEndpoint', () => {
    const payload = buildProviderApiServiceSavePayload({
      apiKeys: [],
      authConfig: { type: 'api-key' },
      draft: createTestDraftSnapshot({
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

    expect(payload.providerUpdates).toEqual({
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
        'openai-responses': { baseUrl: 'https://responses.example.com' },
      },
    });
  });

  it('builds endpoint-only updates for the endpoint settings screen', () => {
    const updates = buildProviderApiServiceEndpointUpdates({
      draft: createTestDraftSnapshot({
        apiKeyEntries: [{ id: 'key-a', isEnabled: true, key: 'sk-a' }],
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
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
      },
    });
  });

  it('saves API key entries with enabled state', () => {
    const payload = buildProviderApiServiceSavePayload({
      apiKeys: [{ id: 'key-a', isEnabled: true, key: 'sk-a' }],
      authConfig: { type: 'api-key' },
      draft: createTestDraftSnapshot({
        apiKeyEntries: [
          { id: 'key-a', isEnabled: false, key: 'sk-a' },
          { id: 'key-b', isEnabled: true, key: 'sk-b' },
        ],
        baseUrlByEndpoint: {
          'openai-chat-completions': 'https://chat.example.com',
        },
      }),
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
      buildProviderApiServiceApiKeysPayload(
        createTestDraftSnapshot({
          apiKeyEntries: [
            { id: 'key-a', isEnabled: false, key: ' sk-a ' },
            { id: 'key-empty', isEnabled: true, key: ' ' },
            { id: 'key-b', isEnabled: true, key: 'sk-b' },
          ],
        }),
      ),
    ).toEqual([
      { id: 'key-a', isEnabled: false, key: 'sk-a' },
      { id: 'key-b', isEnabled: true, key: 'sk-b' },
    ]);
  });

  it('ignores empty new API key rows in dirty state', () => {
    expect(
      getProviderApiServiceApiKeysDirtyState({
        apiKeys: [{ id: 'key-a', isEnabled: true, key: 'sk-a' }],
        draft: createTestDraftSnapshot({
          apiKeyEntries: [
            { id: 'key-a', isEnabled: true, key: 'sk-a' },
            { id: 'key-empty', isEnabled: true, key: '' },
          ],
          apiKeysBaselineSignature: apiKeyEntriesSignature([
            { id: 'key-a', isEnabled: true, key: 'sk-a' },
          ]),
        }),
      }),
    ).toBe(false);
  });

  it('ignores empty new endpoint rows in dirty state', () => {
    expect(
      getProviderApiServiceEndpointDirtyState({
        draft: createTestDraftSnapshot({
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
      buildProviderApiServiceSavePayload({
        apiKeys: [],
        authConfig: { type: 'api-key' },
        draft: createTestDraftSnapshot({
          baseUrlByEndpoint: {
            'openai-chat-completions': 'not a url',
          },
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

  it('does not overwrite dirty API key draft when server keys refetch', () => {
    const provider = { id: 'p1', authType: 'api-key' } as unknown as Provider;
    const initialApiKeys = [{ id: 'k1', isEnabled: true, key: 'sk-old' }];
    const draft = createDraftSnapshot(provider, initialApiKeys, { type: 'api-key' });

    // User modifies a key locally (dirty)
    draft.apiKeyEntries[0].key = 'sk-local-edit';
    draft.apiKeysInput = buildApiKeysInputFromEntries(draft.apiKeyEntries);

    const serverApiKeys = [{ id: 'k2', isEnabled: true, key: 'sk-oauth' }];
    const serverSignature = apiKeyEntriesSignature(normalizeApiKeyEntries(serverApiKeys));
    const currentDraftSignature = apiKeyEntriesSignature(draft.apiKeyEntries);

    expect(currentDraftSignature).not.toBe(draft.apiKeysBaselineSignature);

    // Simulate the useEffect sync logic
    const nextDraft =
      currentDraftSignature !== draft.apiKeysBaselineSignature
        ? draft
        : {
            ...draft,
            apiKeyEntries: normalizeApiKeyEntries(serverApiKeys).map((entry) => ({ ...entry })),
            apiKeysInput: buildApiKeysInputFromEntries(normalizeApiKeyEntries(serverApiKeys)),
            apiKeysBaselineSignature: serverSignature,
          };

    expect(nextDraft.apiKeyEntries).toEqual([{ id: 'k1', isEnabled: true, key: 'sk-local-edit' }]);
    expect(nextDraft.apiKeysInput).toBe('sk-local-edit');
    expect(nextDraft.apiKeysBaselineSignature).toBe(draft.apiKeysBaselineSignature);
  });

  it('syncs server API keys when draft is not dirty', () => {
    const provider = { id: 'p1', authType: 'api-key' } as unknown as Provider;
    const initialApiKeys = [{ id: 'k1', isEnabled: true, key: 'sk-old' }];
    const draft = createDraftSnapshot(provider, initialApiKeys, { type: 'api-key' });

    const serverApiKeys = [{ id: 'k2', isEnabled: true, key: 'sk-oauth' }];
    const serverSignature = apiKeyEntriesSignature(normalizeApiKeyEntries(serverApiKeys));
    const currentDraftSignature = apiKeyEntriesSignature(draft.apiKeyEntries);

    // Draft is not dirty
    expect(currentDraftSignature).toBe(draft.apiKeysBaselineSignature);

    // Simulate the useEffect sync logic
    const nextDraft =
      currentDraftSignature !== draft.apiKeysBaselineSignature
        ? draft
        : {
            ...draft,
            apiKeyEntries: normalizeApiKeyEntries(serverApiKeys).map((entry) => ({ ...entry })),
            apiKeysInput: buildApiKeysInputFromEntries(normalizeApiKeyEntries(serverApiKeys)),
            apiKeysBaselineSignature: serverSignature,
          };

    expect(nextDraft.apiKeyEntries).toEqual([{ id: 'k2', isEnabled: true, key: 'sk-oauth' }]);
    expect(nextDraft.apiKeysInput).toBe('sk-oauth');
    expect(nextDraft.apiKeysBaselineSignature).toBe(serverSignature);
  });
});
