import {
  CLAUDE_WEB_TOOL_MODELS,
  GEMINI_URL_CONTEXT_MODELS,
  GEMINI_WEB_SEARCH_MODELS,
  OPENAI_WEB_SEARCH_MODELS,
} from './serverToolModels';
import { defineProvider } from './types';
import { modeWire } from './wires';

const deepSeekThinkingWire = modeWire('extra_body.thinking.type', {
  off: 'disabled',
  auto: 'enabled',
  effort: 'enabled',
});

const deepSeekModels = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v3-1', 'deepseek-v3-2'];

export default defineProvider({
  authMethods: ['api-key', 'oauth'],
  id: 'cherryin',
  name: 'CherryIN',
  defaultChatEndpoint: 'openai-chat-completions',
  endpointConfigs: {
    'anthropic-messages': {
      adapterFamily: 'cherryin',
      baseUrl: 'https://open.cherryin.net',
    },
    'google-generate-content': {
      adapterFamily: 'cherryin',
      baseUrl: 'https://open.cherryin.net',
    },
    'openai-responses': {
      adapterFamily: 'cherryin',
      baseUrl: 'https://open.cherryin.net',
    },
    'openai-chat-completions': {
      adapterFamily: 'cherryin',
      baseUrl: 'https://open.cherryin.net',
      reasoningFormat: { type: 'openai-chat' },
    },
  },
  serverTools: [
    // Each vendor's tool is passed through on that vendor's own endpoint.
    {
      id: 'web-search',
      modelScope: 'model-dependent',
      endpointTypes: ['openai-responses', 'anthropic-messages', 'google-generate-content'],
      modelIds: [
        ...OPENAI_WEB_SEARCH_MODELS,
        ...CLAUDE_WEB_TOOL_MODELS,
        ...GEMINI_WEB_SEARCH_MODELS,
      ],
    },
    {
      id: 'url-context',
      modelScope: 'model-dependent',
      endpointTypes: ['anthropic-messages', 'google-generate-content'],
      modelIds: [...CLAUDE_WEB_TOOL_MODELS, ...GEMINI_URL_CONTEXT_MODELS],
    },
  ],
  metadata: {
    website: {
      apiKey: 'https://open.cherryin.ai/console/token',
      docs: 'https://open.cherryin.ai',
      models: 'https://open.cherryin.ai/pricing',
      official: 'https://open.cherryin.ai',
    },
  },
  overrides: deepSeekModels.map((modelId) => ({
    modelId,
    reasoningContracts: {
      'openai-chat-completions': { wire: deepSeekThinkingWire },
    },
  })),
});
