import { defineProvider } from './types';

export default defineProvider({
  id: 'meta',
  name: 'Meta',
  authMethods: ['oauth'],
  modelListSource: 'registry',
  defaultChatEndpoint: 'openai-responses',
  endpointConfigs: {
    'openai-responses': { adapterFamily: 'openai', baseUrl: 'https://api.meta.ai/v1' },
  },
  metadata: { website: { official: 'https://www.meta.ai' } },
});
