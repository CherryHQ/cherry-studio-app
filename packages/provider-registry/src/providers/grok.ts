import { defineProvider } from './types';

export default defineProvider({
  authMethods: ['api-key', 'oauth'],
  id: 'grok',
  name: 'Grok',
  defaultChatEndpoint: 'openai-responses',
  endpointConfigs: {
    'openai-chat-completions': {
      adapterFamily: 'xai',
      baseUrl: 'https://api.x.ai',
    },
    'openai-responses': {
      adapterFamily: 'xai-responses',
      baseUrl: 'https://api.x.ai/v1',
      reasoningFormat: {
        type: 'openai-responses',
        wire: {
          off: {
            operations: [
              { target: 'reasoningEffort', value: { source: 'literal', value: 'none' } },
            ],
          },
          auto: {
            operations: [{ target: 'reasoningEffort', value: { source: 'effort' } }],
            effortMap: { auto: 'medium' },
          },
          effort: {
            operations: [{ target: 'reasoningEffort', value: { source: 'effort' } }],
          },
        },
      },
    },
  },
  serverTools: [
    {
      id: 'web-search',
      modelScope: 'model-dependent',
      endpointTypes: ['openai-responses'],
      modelIds: [
        'grok-4',
        'grok-4-1',
        'grok-4-1-fast',
        'grok-4-1-fast-non-reasoning',
        'grok-4-20',
        'grok-4-20-0309-non-reasoning',
        'grok-4-20-multi-agent',
        'grok-4-20-multi-agent-beta',
        'grok-4-20-non-reasoning',
        'grok-4-20-non-reasoning-beta',
        'grok-4-20-reasoning-beta',
        'grok-4-3',
        'grok-4-5',
        'grok-4-6',
        'grok-4-7',
        'grok-4-fast',
      ],
    },
  ],
  metadata: {
    website: {
      docs: 'https://docs.x.ai/',
      models: 'https://docs.x.ai/docs/models',
      official: 'https://x.ai/',
    },
  },
});
