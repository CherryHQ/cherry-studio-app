import { defineProvider } from './types';

export default defineProvider({
  authMethods: ['oauth'],
  id: 'copilot',
  name: 'Github Copilot',
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: {
    'anthropic-messages': { adapterFamily: 'anthropic', baseUrl: 'https://api.githubcopilot.com' },
    'openai-responses': { adapterFamily: 'openai', baseUrl: 'https://api.githubcopilot.com' },
    'openai-chat-completions': {
      adapterFamily: 'github-copilot-openai-compatible',
      baseUrl: 'https://api.githubcopilot.com/',
    },
  },
  metadata: {
    website: {
      official: 'https://github.com/features/copilot',
    },
  },
  modelsDevProvider: 'github-copilot',
});
