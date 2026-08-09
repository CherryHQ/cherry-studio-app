import type { Provider } from '@cherrystudio/universal/data/types/provider';

import { getProviderEndpoints } from '../ProviderEndpointSummary';

describe('getProviderEndpoints', () => {
  it('returns the primary endpoint first and includes every configured endpoint', () => {
    const provider: Pick<Provider, 'defaultChatEndpoint' | 'endpointConfigs'> = {
      defaultChatEndpoint: 'anthropic-messages',
      endpointConfigs: {
        'anthropic-messages': { baseUrl: 'https://anthropic.example.com' },
        'google-generate-content': { baseUrl: 'https://google.example.com' },
        'openai-responses': { baseUrl: 'https://openai.example.com' },
      },
    };

    expect(getProviderEndpoints(provider)).toEqual([
      { iconId: 'anthropic', label: 'Anthropic Messages', type: 'anthropic-messages' },
      { iconId: 'gemini', label: 'Google Gemini', type: 'google-generate-content' },
      { iconId: 'openai', label: 'OpenAI Responses', type: 'openai-responses' },
    ]);
  });

  it('shows the effective OpenAI endpoint when no explicit configuration exists', () => {
    expect(getProviderEndpoints({})).toEqual([
      {
        iconId: 'openai',
        label: 'OpenAI Chat Completions',
        type: 'openai-chat-completions',
      },
    ]);
  });
});
