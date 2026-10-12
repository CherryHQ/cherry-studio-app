import { defineProvider } from './types';

export default defineProvider({
  id: 'perplexity',
  name: 'Perplexity',
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: {
    'openai-chat-completions': {
      adapterFamily: 'perplexity',
      baseUrl: 'https://api.perplexity.ai/',
    },
  },
  serverTools: [
    // Sonar models search on every request; there is no tool to add.
    {
      id: 'web-search',
      modelScope: 'model-dependent',
      endpointTypes: ['openai-chat-completions'],
      modelIds: ['sonar', 'sonar-deep-research', 'sonar-pro', 'sonar-reasoning-pro'],
    },
  ],
  metadata: {
    website: {
      apiKey: 'https://www.perplexity.ai/settings/api',
      docs: 'https://docs.perplexity.ai/home',
      models: 'https://docs.perplexity.ai/guides/model-cards',
      official: 'https://perplexity.ai/',
    },
  },
});
