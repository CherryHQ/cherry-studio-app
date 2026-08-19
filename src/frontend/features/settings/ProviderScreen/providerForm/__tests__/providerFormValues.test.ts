import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { buildProviderApiServiceEndpointUpdates } from '../../apiService/utils/providerApiServiceSave';
import {
  createEmptyProviderFormValues,
  createProviderFormValues,
  isProviderFormDirty,
  type ProviderFormValues,
  resolveProviderFormEndpointTypes,
  toProviderFormEndpointDraft,
} from '../utils/providerFormValues';

function createTestProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    authType: 'api-key',
    defaultChatEndpoint: 'openai-chat-completions',
    endpointConfigs: {
      'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
    },
    id: 'provider-1',
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
        'openai-chat-completions': 'https://chat.example.com',
      },
      name: 'Example',
    });
  });

  it('offers the default chat endpoint first and every configurable one after it', () => {
    expect(resolveProviderFormEndpointTypes(createTestProvider())).toEqual([
      'openai-chat-completions',
      'openai-responses',
      'anthropic-messages',
      'google-generate-content',
      'openai-image-generation',
      'openai-image-edit',
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
    // Typing into an empty endpoint row and clearing it again is not a change.
    expect(
      isDirty({
        ...initialValues,
        endpointUrls: { ...initialValues.endpointUrls, 'openai-responses': '' },
      }),
    ).toBe(false);
    expect(isDirty({ ...initialValues, name: 'Renamed' })).toBe(true);
    expect(isDirty({ ...initialValues, avatarUri: 'file:///picked.png' })).toBe(true);
    expect(isDirty({ ...initialValues, defaultChatEndpoint: 'anthropic-messages' })).toBe(true);
    expect(
      isDirty({
        ...initialValues,
        endpointUrls: {
          ...initialValues.endpointUrls,
          'openai-responses': 'https://responses.example.com',
        },
      }),
    ).toBe(true);
  });

  it('saves the whole visible endpoint set, so clearing a URL removes it', () => {
    const provider = createTestProvider({
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://chat.example.com' },
        'openai-responses': { baseUrl: 'https://responses.example.com' },
      },
    });
    const endpointTypes = resolveProviderFormEndpointTypes(provider);
    const values: ProviderFormValues = {
      ...createProviderFormValues({ avatarUri: null, provider }),
      endpointUrls: {
        'openai-chat-completions': 'https://next.example.com',
        'openai-responses': '',
      },
    };

    expect(
      buildProviderApiServiceEndpointUpdates({
        draft: toProviderFormEndpointDraft({ endpointTypes, values }),
        provider,
      }),
    ).toEqual({
      defaultChatEndpoint: 'openai-chat-completions',
      endpointConfigs: {
        'openai-chat-completions': { baseUrl: 'https://next.example.com' },
      },
    });
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
