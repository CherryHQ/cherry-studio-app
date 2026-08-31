import {
  buildApiKeysInputFromEntries,
  normalizeApiKeyEntries,
  normalizeApiKeySingleLine,
} from '../apiService/utils/providerApiServiceApiKeys';
import { shouldShowApiKeys } from '../apiService/utils/providerApiServiceAuth';
import {
  buildCustomProviderCreationPayload,
  canEditProviderEndpoint,
  findInvalidCustomProviderEndpointUrl,
  getProviderPrimaryBaseUrl,
} from '../apiService/utils/providerApiServiceEndpointRules';
import { buildProviderPrimaryBaseUrlUpdates } from '../apiService/utils/providerApiServiceSave';

describe('provider API service form helpers', () => {
  it('hides manual keys only for login-only providers', () => {
    expect(shouldShowApiKeys('api-key', { authMethods: ['oauth'] })).toBe(false);
    expect(shouldShowApiKeys('api-key', { authMethods: ['api-key', 'oauth'] })).toBe(true);
    expect(shouldShowApiKeys('api-key-aws', { authMethods: ['api-key'] })).toBe(true);
    expect(shouldShowApiKeys('iam-gcp', { authMethods: ['api-key'] })).toBe(false);
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

  it('clears only the primary Base URL and preserves all other endpoint data', () => {
    expect(
      buildProviderPrimaryBaseUrlUpdates({
        baseUrl: '',
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

  it('only allows endpoint editing for URL-based provider auth types', () => {
    expect(canEditProviderEndpoint({ authType: 'api-key' } as never)).toBe(true);
    expect(canEditProviderEndpoint({ authType: 'iam-azure' } as never)).toBe(true);
    expect(canEditProviderEndpoint({ authType: 'api-key-aws' } as never)).toBe(false);
    expect(canEditProviderEndpoint({ authType: 'iam-aws' } as never)).toBe(false);
    expect(canEditProviderEndpoint({ authType: 'iam-gcp' } as never)).toBe(false);
    expect(canEditProviderEndpoint({ authType: 'oauth' } as never)).toBe(false);
  });
});
