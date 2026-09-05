import type { ApiKeyEntry, Provider } from '@/shared/data/types/provider';

import { getProviderConfigurationIssue } from '../providerConfiguration';

const provider = {
  authType: 'api-key',
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: { 'openai-chat-completions': { baseUrl: 'https://example.test/v1' } },
} as Provider;
const key: ApiKeyEntry = { id: 'key', key: 'configured', isEnabled: true };

describe('provider configuration prerequisites', () => {
  it('requires an enabled, non-blank credential when authentication is required', () => {
    expect(getProviderConfigurationIssue(provider, [])).toBe('missing-api-key');
    expect(getProviderConfigurationIssue(provider, [{ ...key, key: '  ' }])).toBe(
      'missing-api-key',
    );
    expect(getProviderConfigurationIssue(provider, [{ ...key, isEnabled: false }])).toBe(
      'disabled-api-keys',
    );
    expect(getProviderConfigurationIssue(provider, [key])).toBeNull();
  });

  it('allows an anonymous provider without a credential', () => {
    expect(getProviderConfigurationIssue({ ...provider, authOptional: true }, [])).toBeNull();
  });

  it('does not substitute a different endpoint for an invalid explicit default', () => {
    expect(
      getProviderConfigurationIssue({ ...provider, defaultChatEndpoint: 'anthropic-messages' }, [
        key,
      ]),
    ).toBe('invalid-endpoint');
    expect(
      getProviderConfigurationIssue(
        {
          ...provider,
          endpointConfigs: { 'openai-chat-completions': { baseUrl: 'file:///private' } },
        },
        [key],
      ),
    ).toBe('invalid-endpoint');
  });
  it('preserves fully configured cloud authentication instead of requiring an API key', () => {
    expect(
      getProviderConfigurationIssue({ ...provider, authType: 'iam-aws' }, [], {
        type: 'iam-aws',
        region: 'us-east-1',
        accessKeyId: 'access',
        secretAccessKey: 'secret',
      }),
    ).toBeNull();
    expect(
      getProviderConfigurationIssue({ ...provider, authType: 'iam-aws' }, [], {
        type: 'iam-aws',
        region: '',
      }),
    ).toBe('unsupported-auth');
  });
});
