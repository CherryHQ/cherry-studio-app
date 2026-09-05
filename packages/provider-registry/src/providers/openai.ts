import { defineProvider } from './types';
import { openaiResponsesSummaryWire } from './wires';

export default defineProvider({
  id: 'openai',
  name: 'OpenAI',
  defaultChatEndpoint: 'openai-responses',
  endpointConfigs: {
    'openai-responses': {
      adapterFamily: 'openai',
      baseUrl: 'https://api.openai.com',
      reasoningFormat: { type: 'openai-responses', wire: openaiResponsesSummaryWire },
    },
  },
  apiFeatures: {
    serviceTier: true,
  },
  metadata: {
    website: {
      apiKey: 'https://platform.openai.com/api-keys',
      docs: 'https://platform.openai.com/docs',
      models: 'https://platform.openai.com/docs/models',
      official: 'https://openai.com/',
    },
  },
});
