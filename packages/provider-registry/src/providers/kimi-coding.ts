import { defineProvider } from './types';

export default defineProvider({
  id: 'kimi-coding',
  name: 'Kimi Code',
  authMethods: ['oauth'],
  modelListSource: 'registry',
  defaultChatEndpoint: 'anthropic-messages',
  endpointConfigs: {
    'anthropic-messages': { adapterFamily: 'anthropic', baseUrl: 'https://api.kimi.com/coding' },
  },
  metadata: { website: { official: 'https://www.kimi.com/code' } },
});
