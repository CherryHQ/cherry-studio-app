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
  id: 'new-api',
  name: 'New API',
  endpointConfigs: {
    'anthropic-messages': {
      adapterFamily: 'newapi',
      baseUrl: 'http://localhost:3000',
    },
    'openai-chat-completions': {
      adapterFamily: 'newapi',
      baseUrl: 'http://localhost:3000',
      reasoningFormat: { type: 'openai-chat' },
    },
    'openai-responses': {
      adapterFamily: 'newapi',
      baseUrl: 'http://localhost:3000',
    },
    'google-generate-content': {
      adapterFamily: 'newapi',
      baseUrl: 'http://localhost:3000',
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
      docs: 'https://docs.newapi.pro',
      official: 'https://docs.newapi.pro/',
    },
  },
  overrides: deepSeekModels.map((modelId) => ({
    modelId,
    reasoningContracts: {
      'openai-chat-completions': { wire: deepSeekThinkingWire },
    },
  })),
});
