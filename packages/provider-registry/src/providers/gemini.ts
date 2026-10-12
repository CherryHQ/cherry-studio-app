import type { ReasoningWireProfile } from '../schemas/reasoningWire';
import { GEMINI_URL_CONTEXT_MODELS, GEMINI_WEB_SEARCH_MODELS } from './serverToolModels';
import { defineProvider } from './types';

const budgetThinkingWire: ReasoningWireProfile = {
  off: {
    operations: [
      {
        target: 'thinkingConfig.includeThoughts' as const,
        value: { source: 'literal' as const, value: false },
      },
      {
        target: 'thinkingConfig.thinkingBudget' as const,
        value: { source: 'literal' as const, value: 0 },
      },
    ],
  },
  auto: {
    operations: [
      {
        target: 'thinkingConfig.includeThoughts' as const,
        value: { source: 'literal' as const, value: true },
      },
      {
        target: 'thinkingConfig.thinkingBudget' as const,
        value: { source: 'literal' as const, value: -1 },
      },
    ],
  },
  effort: {
    operations: [
      {
        target: 'thinkingConfig.includeThoughts' as const,
        value: { source: 'literal' as const, value: true },
      },
      { target: 'thinkingConfig.thinkingBudget' as const, value: { source: 'budget' as const } },
    ],
    budget: { missing: { type: 'fallback', value: -1 } },
  },
};

const budgetThinkingModels = [
  'gemini-2-5-flash-image',
  'gemini-2-5-flash-image-preview',
  'gemini-2-5-flash-lite',
  'gemini-2-5-pro',
  'gemini-2-5-flash',
  'gemini-3-1-flash-lite-image',
  'gemini-omni-flash-preview',
  'gemini-2-5-pro-preview',
  'gemini-2-5-pro-preview-05-06',
];

export default defineProvider({
  id: 'gemini',
  name: 'Gemini',
  // Explicit Generate Content support; Live, image and batch variants stay external.
  serverTools: [
    {
      id: 'web-search',
      modelScope: 'model-dependent',
      endpointTypes: ['google-generate-content'],
      modelIds: GEMINI_WEB_SEARCH_MODELS,
    },
    {
      id: 'url-context',
      modelScope: 'model-dependent',
      endpointTypes: ['google-generate-content'],
      modelIds: GEMINI_URL_CONTEXT_MODELS,
    },
  ],
  defaultChatEndpoint: 'google-generate-content',
  endpointConfigs: {
    'google-generate-content': {
      adapterFamily: 'google',
      baseUrl: 'https://generativelanguage.googleapis.com',
    },
  },
  metadata: {
    website: {
      apiKey: 'https://aistudio.google.com/app/apikey',
      docs: 'https://ai.google.dev/gemini-api/docs',
      models: 'https://ai.google.dev/gemini-api/docs/models/gemini',
      official: 'https://gemini.google.com/',
    },
  },
  overrides: budgetThinkingModels.map((modelId) => ({
    modelId,
    reasoningContracts: {
      'google-generate-content': { wire: budgetThinkingWire },
    },
  })),
});
