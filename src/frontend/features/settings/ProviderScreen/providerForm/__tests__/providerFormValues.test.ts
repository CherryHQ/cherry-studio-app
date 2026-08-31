import type { Provider } from '@/shared/data/types/provider';

import {
  createEmptyProviderFormValues,
  createProviderFormValues,
  isProviderFormDirty,
  type ProviderFormValues,
  resolveProviderFormEndpointTypes,
} from '../utils/providerFormValues';

function createTestProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    authType: 'api-key',
    defaultChatEndpoint: 'openai-chat-completions',
    endpointConfigs: {
      'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
    },
    id: 'provider-1',
    isEnabled: true,
    name: 'Example',
    ...overrides,
  } as Provider;
}

describe('provider form values', () => {
  it('seeds the draft from the provider it edits', () => {
    const provider = createTestProvider({
      defaultChatEndpoint: 'anthropic-messages',
      endpointConfigs: {
        'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
      },
    });

    expect(createProviderFormValues({ avatarUri: 'file:///logo.png', provider })).toEqual({
      apiKey: '',
      avatarUri: 'file:///logo.png',
      defaultChatEndpoint: 'anthropic-messages',
      endpointUrls: {
        'anthropic-messages': 'https://anthropic.example.com',
      },
      name: 'Example',
    });
  });

  it('offers only the current primary endpoint', () => {
    expect(resolveProviderFormEndpointTypes(createTestProvider())).toEqual([
      'openai-chat-completions',
    ]);
  });

  it('offers no endpoints at all when the auth type has no editable URL', () => {
    expect(resolveProviderFormEndpointTypes(createTestProvider({ authType: 'iam-gcp' }))).toEqual(
      [],
    );
  });

  it('reports a draft as clean until a field actually changes', () => {
    const provider = createTestProvider();
    const endpointTypes = resolveProviderFormEndpointTypes(provider);
    const initialValues = createProviderFormValues({ avatarUri: null, provider });
    const isDirty = (values: ProviderFormValues) =>
      isProviderFormDirty({ endpointTypes, initialValues, values });

    expect(isDirty(initialValues)).toBe(false);
    expect(isDirty({ ...initialValues, name: 'Renamed' })).toBe(true);
    expect(isDirty({ ...initialValues, avatarUri: 'file:///picked.png' })).toBe(true);
    expect(
      isDirty({
        ...initialValues,
        endpointUrls: {
          ...initialValues.endpointUrls,
          'openai-chat-completions': 'https://next.example.com',
        },
      }),
    ).toBe(true);
  });

  it('starts a new provider on the OpenAI chat completions endpoint', () => {
    expect(createEmptyProviderFormValues()).toEqual({
      apiKey: '',
      avatarUri: null,
      defaultChatEndpoint: 'openai-chat-completions',
      endpointUrls: {},
      name: '',
    });
  });
});
